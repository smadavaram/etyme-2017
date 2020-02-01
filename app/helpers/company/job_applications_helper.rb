# frozen_string_literal: true

module Company::JobApplicationsHelper
  def job_application_top_links(app, btn_size_class = 'btn-md')
    # status: [ :pending_review ,:rejected , :short_listed,:interviewing,:hired ]
    if app.job.company == current_company && has_permission?('manage_job_applications')
      btn = ''
      btn += "  <button type='button' class='btn #{btn_size_class}  btn-primary mt-12 margin-right-5 #{app.rejected? || app.hired? || app.prescreen? ? 'disabled' : ''} prescreen' data-toggle='modal' data-target='.bd-example-modal-lg'>Pre Screen</button>"
      btn += link_to 'Short list', short_list_job_application_path(app, conversation_id: @conversation.id), method: :post, class: "btn #{btn_size_class}  btn-primary mt-12 margin-right-5 #{!app.prescreen? ? 'disabled' : ''}"
      btn += link_to 'Reject', reject_job_application_path(app, conversation_id: @conversation.id), method: :post, class: "btn #{btn_size_class}  btn-primary mt-12 margin-right-5 #{app.hired? || app.contract.present? || app.rejected? ? 'disabled' : ''}"
      btn += link_to 'Interview', interview_job_application_path(app, conversation_id: @conversation.id), method: :post, class: "btn #{btn_size_class}  btn-primary mt-12 margin-right-5 #{!app.short_listed? ? 'disabled' : ''}"
      btn += link_to 'Hire', hire_job_application_path(app, conversation_id: @conversation.id), method: :post, class: " btn #{btn_size_class}  btn-primary mt-12 margin-right-5 #{!app.interviewing? ? 'disabled' : ''}"
      btn += if app.is_candidate_applicant? && !current_company.consultants.where(candidate_id: app.applicationable_id).present?
               link_to 'Start On-Boarding', new_job_application_consultant_path(app), class: "contract btn #{btn_size_class} btn-default mt-12 margin-right-5 #{!app.hired? || app.contract.present? ? 'disabled' : ''}"
             else
               link_to 'Start Contract', accept_job_application_path(app), method: :post, remote: true, class: "contract btn #{btn_size_class} btn-default mt-12 margin-right-5 #{!app.hired? || app.contract.present? ? 'disabled' : ''}"
             end
      btn.to_s
    end
  end
end
