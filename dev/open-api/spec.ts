import {
  CUSTOM_ACTIVITY_DEFAULT_HEIGHT, CUSTOM_ACTIVITY_HTML_LIMIT, CUSTOM_ACTIVITY_LIMIT, CUSTOM_ACTIVITY_MAX_HEIGHT, CUSTOM_ACTIVITY_MIN_HEIGHT,
  ACTIVITY_BADGE_TONES, ACTIVITY_RESULT_STATUSES, CUSTOM_ACTIVITY_PAYLOAD_LIMIT, CUSTOM_ACTIVITY_SUBMIT_MESSAGE,
  CUSTOM_ACTIVITY_TOTAL_HTML_LIMIT, QUESTION_TYPES, REVIEW_DECISIONS,
} from "../../shared/contracts/interview-rounds.ts";
import { DESIGN_BLOCK_TYPES, DESIGN_TARGETS } from "../../shared/contracts/design.ts";
import { variablesForTarget } from "../../shared/design/variables.ts";
import { OPEN_API_SCOPES } from "../../shared/contracts/open-api.ts";
import { defaultTheme } from "../../shared/design/modules.ts";
import { MAX_FREE_HTML_LENGTH } from "../../shared/email/free-html.ts";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const typeString = { type: "string" };
const json = (schema: object) => ({ "application/json": { schema } });
const object = (properties: object, required = Object.keys(properties)) => ({ type: "object", properties, required });
const array = (items: object) => ({ type: "array", items });
const date = { type: "string", format: "date-time" };
const nullableDate = { type: ["string", "null"], format: "date-time" };
const id = { type: "string", format: "uuid" };
const target = { type: "string", enum: DESIGN_TARGETS };
const name = { type: "string", minLength: 1, maxLength: 160 };
const errors = {
  "400": { description: "Invalid request", content: json(ref("Error")) },
  "401": { description: "Missing, invalid or revoked Bearer key", content: json(ref("Error")) },
  "403": { description: "Wrong scope or outside the local server boundary", content: json(ref("Error")) },
  "404": { description: "Record not found", content: json(ref("Error")) },
  "409": { description: "Conflicting update", content: json(ref("Error")) },
  "413": { description: "Request body limit exceeded", content: json(ref("Error")) },
  "415": { description: "JSON body required", content: json(ref("Error")) },
};
const success = (schema: object) => ({ description: "Success", content: json(object({
  data: schema, warnings: array(typeString),
}, ["data"])) });
function operation(operationId: string, scope: (typeof OPEN_API_SCOPES)[number], response: object, options: {
  input?: string; queryTarget?: boolean; pathId?: boolean | "record"; status?: string; description?: string;
} = {}) {
  return {
    operationId, security: [{ bearerKey: [] }], "x-required-scopes": [scope],
    description: options.description ?? `Requires ${scope}.`,
    ...(options.input ? { requestBody: { required: true, content: json(ref(options.input)) } } : {}),
    ...(options.queryTarget || options.pathId ? { parameters: [options.pathId
      ? { name: "id", in: "path", required: true, schema: options.pathId === "record" ? recordId : id }
      : { name: "target", in: "query", schema: target }] } : {}),
    responses: { [options.status ?? "200"]: success(response), ...errors },
  };
}

const recordId = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$" };
const boolean = { type: "boolean" };
const dimension = { enum: ["EI", "SN", "TF", "JP"] };
const roundKind = { type: "string", enum: ["interview", "offer"] };
const roundFields = {
  name: { ...typeString, minLength: 1, maxLength: 60 },
  description: { ...typeString, maxLength: 1000 },
  defaultEmailTemplateId: { anyOf: [recordId, { type: "null" }] },
  defaultInviteTemplateId: { anyOf: [recordId, { type: "null" }] },
  formConfig: { ...object({ enabled: boolean, questions: { ...array(ref("FormQuestion")), maxItems: 40 } }), additionalProperties: false },
  mbtiConfig: { ...object({ enabled: boolean, questions: { ...array(ref("MbtiQuestion")), maxItems: 160 } }), additionalProperties: false },
};
const roundInput = object({ ...roundFields, kind: roundKind,
  customActivities: { ...array(ref("CustomActivity")), maxItems: CUSTOM_ACTIVITY_LIMIT,
    description: `Optional on input. Omission preserves the existing activities on PUT; use [] to clear. IDs must be unique. HTML totals at most ${CUSTOM_ACTIVITY_TOTAL_HTML_LIMIT} UTF-8 bytes per round.` },
}, Object.keys(roundFields));
const nullOr = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const activityKind = { enum: ["sandbox_widget", "external_app"] };
const activityFields = {
  id: { ...recordId, not: { enum: ["constructor", "prototype"] } }, title: { ...typeString, minLength: 1, maxLength: 80 },
  description: { ...typeString, maxLength: 400 }, required: boolean, enabled: boolean,
};
const resultFields = {
  status: { enum: ACTIVITY_RESULT_STATUSES, default: "completed" },
  progress: { type: "number", minimum: 0, maximum: 100 }, progressText: { ...typeString, maxLength: 100 },
  score: { type: "number", minimum: 0, maximum: 10000 }, maxScore: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
  scoreLabel: { ...typeString, maxLength: 40 }, scoreUnit: { ...typeString, maxLength: 16 },
  summary: { ...typeString, maxLength: 500 }, badge: ref("ActivityBadge"),
  metrics: { ...array(ref("ActivityMetric")), maxItems: 8 }, qa: { ...array(ref("ActivityAnswer")), maxItems: 40 },
  tags: { ...array({ ...typeString, minLength: 1, maxLength: 24 }), maxItems: 10 },
  payload: { ...ref("ActivityPayload"), description: `Pure JSON object, up to ${CUSTOM_ACTIVITY_PAYLOAD_LIMIT} UTF-8 bytes and 12 levels of nesting.` },
};
const submissionFields = { ...resultFields, submittedAt: nullableDate, revision: { type: "integer", minimum: 1 } };
const activityToken = { ...typeString, minLength: 169, maxLength: 169 };
const activitySecurity = [{ activityToken: [] }];
const activityErrors = { ...errors, "401": { description: "Invalid, expired or revoked activity credential", content: json(ref("Error")) } };

const textKeys = new Set([...variablesForTarget("email"), ...variablesForTarget("invite_page")].map(({ key }) => key));
const templateExample = {
  name: "面试邀请",
  document: {
    schemaVersion: 1, target: "email", mode: "blocks", meta: { subjectTemplate: "面试邀请 · {{candidate_name}}" },
    theme: defaultTheme("email"),
    blocks: [
      { id: "title", type: "heading", props: { text: "{{candidate_name}} 同学，你好！", level: 1 } },
      { id: "invite", type: "button", props: { text: "打开邀请函", url: "{{rsvp_link}}" } },
    ],
  },
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: { title: "CampusFlow Open API", version: "1.0.0",
    description: "本机模板设计、面试轮次配置与只读候选人 API。通过 CampusFlow 开放 API 界面创建并管理 Bearer Key。" },
  servers: [{ url: "/api/open/v1" }],
  paths: {
    "/openapi.json": { get: { operationId: "getOpenApiSpec", security: [], responses: {
      "200": { description: "OpenAPI 3.1 document", content: json({ type: "object" }) },
    } } },
    "/templates": {
      get: operation("listTemplates", "templates:read", array(ref("Template")), { queryTarget: true }),
      post: operation("createTemplate", "templates:write", ref("Template"), { input: "TemplateInput", status: "201" }),
    },
    "/templates/{id}": {
      get: operation("getTemplate", "templates:read", ref("Template"), { pathId: true }),
      put: operation("replaceTemplate", "templates:write", ref("Template"), { pathId: true, input: "TemplateInput" }),
      delete: operation("deleteTemplate", "templates:write", object({ deleted: { const: true } }), { pathId: true }),
    },
    "/templates/{id}/render": { post: operation("renderTemplate", "templates:read", ref("RenderResult"), {
      description: "Requires templates:read. Supplying candidateId also requires recruitment:read. Use {} for sample values. The result does not create invitation links.",
      pathId: true, input: "RenderInput",
    }) },
    "/rounds": {
      get: operation("listRounds", "rounds:read", array(ref("InterviewRound"))),
      post: operation("createRound", "rounds:write", ref("InterviewRound"), { input: "InterviewRoundInput", status: "201" }),
    },
    "/rounds/{id}": { put: operation("replaceRound", "rounds:write", ref("InterviewRound"), { pathId: "record", input: "InterviewRoundInput" }) },
    "/candidates/{id}/submissions": { get: operation("getCandidateSubmissions", "recruitment:read", array(ref("RoundSubmission")), {
      pathId: "record", description: "Returns questionnaire answers, MBTI results, RSVP history, interviewer reviews, and custom activity progress and results by invitation and attempt. Executable widget HTML and credentials are excluded.",
    }) },
    "/activities/callback": {
      post: { operationId: "submitExternalActivity", security: [...activitySecurity, {}],
        description: "Read cf_activity_token and cf_callback_url from the launch URL fragment. Use the activity bearer or cf_activity_token in JSON. Browser Origin must match the configured app. Save repeatable in_progress updates, or submit completed / needs_review once. Omitted status defaults to completed. Terminal retries return the locked result.",
        requestBody: { required: true, content: json(ref("ExternalActivityCallback")) },
        responses: { "200": success(ref("CustomActivitySubmission")), ...activityErrors },
      },
      options: { operationId: "preflightExternalActivity", security: [], responses: { "204": { description: "CORS preflight for JSON POST and Authorization" } } },
    },
    "/activities/session": {
      get: { operationId: "getActivitySession", security: activitySecurity,
        description: "Read one candidate's activity context using the HMAC-signed activity token from the launch fragment. It is bound to one candidate, invitation and activity for up to two hours, capped by the invitation expiry. Rotation or revocation invalidates the token. This endpoint returns no email, phone or other activities.",
        responses: { "200": success(ref("ActivitySession")), ...activityErrors } },
      post: { operationId: "getActivitySessionWithBody", security: [],
        description: "Read the same context using cf_activity_token in JSON when a Bearer header is unavailable.",
        requestBody: { required: true, content: json(ref("ActivitySessionCredential")) },
        responses: { "200": success(ref("ActivitySession")), ...activityErrors } },
      options: { operationId: "preflightActivitySession", security: [], responses: { "204": { description: "CORS preflight for session read" } } },
    },
    "/candidates": { get: operation("listCandidates", "recruitment:read", array(ref("Candidate"))) },
  },
  components: {
    securitySchemes: { bearerKey: { type: "http", scheme: "bearer", bearerFormat: "CampusFlow API Key" },
      activityToken: { type: "http", scheme: "bearer", bearerFormat: "CampusFlow Activity Token" } },
    schemas: {
      Error: object({ message: typeString }),
      DesignTheme: object({
        ...Object.fromEntries(["primaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor", "mutedTextColor", "borderColor", "buttonColor", "buttonTextColor"].map((key) => [
          key, { type: "string", pattern: "^(#[0-9a-fA-F]{3,8}|transparent)$" },
        ])),
        fontFamily: { type: "string", maxLength: 200 },
        width: { type: "number", minimum: 0, maximum: 2400 },
        radius: { type: "number", minimum: 0, maximum: 2400 },
        spacing: { type: "number", minimum: 0, maximum: 2400 },
      }, ["primaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor", "mutedTextColor", "fontFamily", "width", "radius", "spacing"]),
      DesignBlock: object({ id: { ...typeString, minLength: 1 }, type: { type: "string", enum: DESIGN_BLOCK_TYPES },
        props: { type: "object", description: "Native CampusFlow block fields. The module must support the document target." } }),
      DesignDocument: {
        ...object({
          schemaVersion: { const: 1 }, target, mode: { enum: ["blocks", "html"], default: "blocks" },
          meta: object({ subjectTemplate: { ...typeString, maxLength: 5000 }, preheaderText: { ...typeString, maxLength: 5000 } }, []),
          theme: ref("DesignTheme"), blocks: { ...array(ref("DesignBlock")), maxItems: 200 },
          customHtml: object({
            html: { ...typeString, maxLength: MAX_FREE_HTML_LENGTH },
            fontFamily: { ...typeString, maxLength: 200 }, source: { enum: ["starter", "ai", "import"] },
          }, ["html"]),
        }, ["schemaVersion", "target", "meta", "theme", "blocks"]),
        allOf: [{ if: { properties: { mode: { const: "html" } }, required: ["mode"] }, then: { required: ["customHtml"] } }],
        description: "Protected link variables {{rsvp_link}} and {{onboarding_link}} must be complete link destinations when used in URLs. onboarding_link is email-only.",
      },
      TemplateInput: {
        ...object({ name, document: ref("DesignDocument"), origin: { enum: ["manual", "ai"] } }, ["name", "document"]),
        examples: [templateExample, {
          name: "网页版邀请函", document: { schemaVersion: 1, target: "invite_page", mode: "html",
            meta: {}, theme: defaultTheme("invite_page"), blocks: [], customHtml: { html: "<h1>你好，{{candidate_name}}</h1>", source: "import" } },
        }],
      },
      Template: object({ id, name, target, schemaVersion: { const: 1 }, document: ref("DesignDocument"), origin: { enum: ["manual", "ai"] }, createdAt: date, updatedAt: date }),
      RenderInput: object({
        variables: { type: "object", propertyNames: { enum: [...textKeys] }, additionalProperties: { type: "string", maxLength: 4000 } },
        candidateId: typeString,
      }, []),
      RenderResult: object({ subject: typeString, preheader: typeString, html: typeString, text: typeString, warnings: array(typeString), missingVariables: array(typeString) }),
      InterviewRoundInput: { ...roundInput, additionalProperties: false, examples: [{
        name: "作品交流", description: "", defaultEmailTemplateId: null, defaultInviteTemplateId: null,
        formConfig: { enabled: true, questions: [{ id: "portfolio", title: "作品集链接", type: "url", description: "", placeholder: "https://", required: true, options: [] }] },
        mbtiConfig: { enabled: false, questions: [] },
      }] },
      InterviewRound: object({ ...roundInput.properties, id: recordId, sortOrder: { type: "integer", minimum: 0 },
        archivedAt: nullableDate, createdAt: date, updatedAt: date }),
      CustomActivity: { oneOf: [
        { ...object({ ...activityFields, kind: { const: "sandbox_widget" },
          html: { ...typeString, minLength: 1, maxLength: CUSTOM_ACTIVITY_HTML_LIMIT,
            description: `One HTML/CSS/JS file, at most ${CUSTOM_ACTIVITY_HTML_LIMIT} UTF-8 bytes. Use 'campusflow:activity:progress' to persist drafts and '${CUSTOM_ACTIVITY_SUBMIT_MESSAGE}' for terminal outcomes. Send 'campusflow:activity:ready' to receive 'campusflow:activity:restore' with the last saved { progress, progressText, payload, revision }.` },
          height: { type: "integer", minimum: CUSTOM_ACTIVITY_MIN_HEIGHT, maximum: CUSTOM_ACTIVITY_MAX_HEIGHT, default: CUSTOM_ACTIVITY_DEFAULT_HEIGHT },
        }, ["id", "title", "kind", "required", "enabled", "html"]), additionalProperties: false },
        { ...object({ ...activityFields, kind: { const: "external_app" },
          url: { ...typeString, format: "uri", pattern: "^[Hh][Tt][Tt][Pp][Ss]?://", maxLength: 2048 },
        }, ["id", "title", "kind", "required", "enabled", "url"]), additionalProperties: false },
      ] },
      ActivityPayload: { type: "object", propertyNames: { not: { enum: ["__proto__", "constructor", "prototype"] } },
        additionalProperties: ref("ActivityJsonValue") },
      ActivityJsonValue: { anyOf: [{ type: ["string", "number", "boolean", "null"] }, array(ref("ActivityJsonValue")), ref("ActivityPayload")] },
      ActivityBadge: { ...object({ label: { ...typeString, minLength: 1, maxLength: 24 }, tone: { enum: ACTIVITY_BADGE_TONES } }, ["label"]), additionalProperties: false },
      ActivityMetric: { ...object({ label: { ...typeString, minLength: 1, maxLength: 40 }, value: { type: "number", minimum: -1e9, maximum: 1e9 },
        max: { type: "number", exclusiveMinimum: 0, maximum: 1e9 }, unit: { ...typeString, maxLength: 16 } }, ["label", "value"]), additionalProperties: false },
      ActivityAnswer: { ...object({ question: { ...typeString, minLength: 1, maxLength: 500 }, answer: { ...typeString, minLength: 1, maxLength: 2000 },
        tag: { ...typeString, maxLength: 24 } }, ["question", "answer"]), additionalProperties: false },
      CustomActivitySubmission: object(submissionFields, ["status", "summary", "submittedAt", "revision"]),
      ExternalActivityCallback: { ...object({ cf_activity_token: activityToken, ...resultFields }, []), additionalProperties: false,
        description: "96 KiB UTF-8 total result limit. If Authorization is omitted, cf_activity_token is required.",
        if: { required: ["status"], properties: { status: { const: "in_progress" } } },
        else: { required: ["summary"], properties: { summary: { ...typeString, minLength: 1, maxLength: 500 } } } },
      ActivitySession: object({ candidateName: typeString, roundName: typeString, activityId: recordId, activityTitle: typeString,
        status: { enum: ["pending", ...ACTIVITY_RESULT_STATUSES] }, expiresAt: date, submission: nullOr(ref("CustomActivitySubmission")) }),
      ActivitySessionCredential: { ...object({ cf_activity_token: activityToken }), additionalProperties: false },
      RecordedCustomActivity: object({ ...submissionFields, activityId: recordId, title: typeString, required: boolean, kind: activityKind,
        generation: { type: "integer", minimum: 1 } }, ["activityId", "title", "required", "kind", "generation", "status", "summary", "submittedAt", "revision"]),
      FormQuestion: { ...object({
        id: recordId, title: { ...typeString, minLength: 1, maxLength: 200 }, type: { enum: QUESTION_TYPES },
        description: { ...typeString, maxLength: 400 }, placeholder: { ...typeString, maxLength: 160 },
        required: boolean, options: { ...array({ ...typeString, minLength: 1, maxLength: 120 }), maxItems: 24, uniqueItems: true },
      }), additionalProperties: false, allOf: [{
        if: { properties: { type: { enum: ["single_choice", "multi_choice", "select"] } } },
        then: { properties: { options: { minItems: 2 } } }, else: { properties: { options: { maxItems: 0 } } },
      }] },
      MbtiQuestion: { ...object({
        id: recordId, dimension, direction: { enum: [-1, 1] }, enabled: boolean,
        text: { ...typeString, minLength: 1, maxLength: 240 }, consistencyGroup: recordId,
      }, ["id", "dimension", "direction", "enabled", "text"]), additionalProperties: false },
      MbtiResult: object({
        type: { ...typeString, pattern: "^[EI][SN][TF][JP]$" },
        dimensions: array(object({ dimension, firstPercent: { type: "integer", minimum: 0, maximum: 100 },
          score: { type: "integer" }, count: { type: "integer" }, close: boolean })),
        stability: { type: ["integer", "null"], minimum: 0, maximum: 100 }, answeredCount: { type: "integer" },
      }),
      RoundReview: object({ rating: { type: "integer", minimum: 1, maximum: 5 }, decision: { enum: REVIEW_DECISIONS }, notes: typeString, reviewerName: typeString, updatedAt: date }),
      RoundSubmission: object({ roundId: recordId, roundName: typeString, roundKind, review: nullOr(ref("RoundReview")), enteredAt: date, invitations: array(object({
        inviteId: id, issuedAt: date, rsvpStatus: { enum: ["pending", "confirmed", "cancelled", "reschedule_requested"] },
        respondedAt: nullableDate,
        form: nullOr(object({ submittedAt: date, questions: array(ref("FormQuestion")), answers: { type: "object",
          additionalProperties: { anyOf: [typeString, array(typeString), { type: "integer", minimum: 1, maximum: 5 }] } } })),
        mbti: nullOr(object({ submittedAt: date, result: ref("MbtiResult") })),
        customActivities: array(ref("RecordedCustomActivity")),
      })) }),
      Candidate: object({
        id: typeString, name: typeString, email: typeString, department: typeString, cycle: typeString, stage: typeString, roundId: recordId,
        latestRsvp: { anyOf: [object({ status: typeString, invitationStatus: typeString, respondedAt: nullableDate, expiresAt: date, valid: { type: "boolean" } }), { type: "null" }] },
      }),
    },
  },
};
