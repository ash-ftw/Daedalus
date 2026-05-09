import type { SessionSummary } from "../../../shared/src/types";

interface RosterMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface CourseworkItem {
  id: string;
  title: string;
  state?: string;
  alternateLink?: string;
}

function requireEnv(value: string | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} is not configured`);
  }

  return value;
}

function formBody(entries: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (typeof value !== "undefined") {
      params.set(key, String(value));
    }
  });
  return params;
}

export class CanvasLmsClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(env = process.env) {
    this.baseUrl = requireEnv(env.CANVAS_LMS_BASE_URL, "CANVAS_LMS_BASE_URL").replace(/\/+$/, "");
    this.token = requireEnv(env.CANVAS_LMS_TOKEN, "CANVAS_LMS_TOKEN");
  }

  async roster(courseId: string): Promise<RosterMember[]> {
    const response = await this.request(`/api/v1/courses/${encodeURIComponent(courseId)}/enrollments?type[]=StudentEnrollment&include[]=user`);
    const enrollments = (await response.json()) as Array<{
      id: number;
      role: string;
      user?: {
        id: number;
        name: string;
        email?: string;
      };
    }>;

    return enrollments
      .filter((enrollment) => enrollment.user)
      .map((enrollment) => ({
        id: String(enrollment.user?.id ?? enrollment.id),
        name: enrollment.user?.name ?? "Canvas user",
        email: enrollment.user?.email,
        role: enrollment.role
      }));
  }

  async submitSummary(courseId: string, assignmentId: string, summary: SessionSummary) {
    const response = await this.request(`/api/v1/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
      method: "POST",
      body: formBody({
        "submission[submission_type]": "online_text_entry",
        "submission[body]": summaryText(summary)
      })
    });

    return response.json();
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Canvas LMS request failed with ${response.status}`);
    }

    return response;
  }
}

export class MoodleClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(env = process.env) {
    this.baseUrl = requireEnv(env.MOODLE_BASE_URL, "MOODLE_BASE_URL").replace(/\/+$/, "");
    this.token = requireEnv(env.MOODLE_TOKEN, "MOODLE_TOKEN");
  }

  async roster(courseId: string): Promise<RosterMember[]> {
    const users = (await this.call("core_enrol_get_enrolled_users", { courseid: courseId })) as Array<{
      id: number;
      fullname: string;
      email?: string;
      roles?: Array<{ shortname: string }>;
    }>;

    return users.map((user) => ({
      id: String(user.id),
      name: user.fullname,
      email: user.email,
      role: user.roles?.map((role) => role.shortname).join(", ")
    }));
  }

  async submitSummary(assignmentId: string, summary: SessionSummary) {
    return this.call("mod_assign_save_submission", {
      assignmentid: assignmentId,
      "plugindata[onlinetext_editor][text]": summaryText(summary),
      "plugindata[onlinetext_editor][format]": 1
    });
  }

  private async call(wsfunction: string, entries: Record<string, string | number | boolean | undefined>) {
    const body = formBody({
      wstoken: this.token,
      wsfunction,
      moodlewsrestformat: "json",
      ...entries
    });
    const response = await fetch(`${this.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Moodle request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.exception) {
      throw new Error(payload.message ?? "Moodle web service error");
    }

    return payload;
  }
}

export class GoogleClassroomClient {
  private readonly token: string;

  constructor(env = process.env) {
    this.token = requireEnv(env.GOOGLE_CLASSROOM_ACCESS_TOKEN, "GOOGLE_CLASSROOM_ACCESS_TOKEN");
  }

  async roster(courseId: string): Promise<RosterMember[]> {
    const payload = (await this.request(`/v1/courses/${encodeURIComponent(courseId)}/students`)) as {
      students?: Array<{
        userId: string;
        profile?: {
          name?: { fullName?: string };
          emailAddress?: string;
        };
      }>;
    };

    return (payload.students ?? []).map((student) => ({
      id: student.userId,
      name: student.profile?.name?.fullName ?? "Classroom student",
      email: student.profile?.emailAddress,
      role: "student"
    }));
  }

  async coursework(courseId: string): Promise<CourseworkItem[]> {
    const payload = (await this.request(`/v1/courses/${encodeURIComponent(courseId)}/courseWork`)) as {
      courseWork?: CourseworkItem[];
    };

    return payload.courseWork ?? [];
  }

  private async request(path: string) {
    const response = await fetch(`https://classroom.googleapis.com${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Google Classroom request failed with ${response.status}`);
    }

    return response.json();
  }
}

export function summaryText(summary: SessionSummary) {
  const lines = [
    `Daedalus session summary${summary.classroomId ? ` for ${summary.classroomId}` : ""}`,
    `Boards: ${summary.boardCount}`,
    `Help requested: ${summary.helpRequestedCount}`,
    `Average quality score: ${summary.averageQualityScore}`,
    "",
    ...summary.boards.map(
      (board) =>
        `${board.boardName}: ${board.diagramType ?? "Unknown diagram"}, score ${board.qualityScore}, ${board.summary}`
    )
  ];

  return lines.join("\n");
}
