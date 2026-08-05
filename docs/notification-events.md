# Notification events

Notifications must be addressed to the affected user and tagged with the workspace role that should receive them. Student and teacher inboxes are separate; use `shared` only for account-wide events. Do not notify users about their own routine actions, and deduplicate retries.

| Event | Recipient / role | Notification |
|---|---|---|
| Student recommends a class source | Class teacher / teacher | Student name, source title, and class; link to the recommendation queue. |
| Teacher approves or declines a recommended source | Recommending student / student | Decision, source title, and class. |
| Teacher changes a student's goal or deadline | Affected student / student | Goal title and what changed. |
| Student joins or leaves a class | Class teacher / teacher | Student name and class. |
| Teacher removes a student | Affected student / student | Class name and removal notice. |
| Class invitation is created, accepted, declined, or revoked | Invited or inviting user / applicable role | Invitation status and class. |
| Teacher adds, removes, or materially updates a class resource | Enrolled students / student | Resource and class; avoid alerts for cosmetic edits. |
| Assignment is published, changed, due soon, or graded | Affected students / student | Assignment, class, deadline/status. |
| Study session invitation, reschedule, cancellation, or reminder | Participants / active role | Session title and time; suppress duplicate reminders. |
| Goal or assignment deadline is approaching | Owner / matching role | One reminder per configured interval. |
| Moderation or safety action affects content or access | Affected user / matching role | Action, reason when safe, and appeal/help link. |
| Password, email, role, or other security-sensitive account change | User / shared | Account change and recovery guidance. |

Read state must be stored per user and per active role. Opening a notification marks that item read immediately; the red dot remains only while another notification in that role is unread.
