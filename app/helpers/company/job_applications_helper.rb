module Company::JobApplicationsHelper
  def job_application_top_links(app)
    # status: [ :pending_review ,:rejected , :short_listed,:interviewing,:hired ]
    if  app.job.company == current_company && has_permission?('manage_job_applications')
      btn = ""
      btn += link_to 'Short list' ,short_list_job_application_path(app) , method: :post   ,  class: "btn btn-md  btn-primary mt-12 margin-right-5 #{!app.pending_review? ? 'disabled' : "" }"
      btn += link_to 'Reject' , reject_job_application_path(app), method: :post  , class: "btn btn-md  btn-primary mt-12 margin-right-5 #{app.hired? || app.contract.present? || app.rejected? ? 'disabled' : "" }"
      btn += link_to 'Interview' , interview_job_application_path(app) , method: :post  , class: "btn btn-md  btn-primary mt-12 margin-right-5 #{!app.short_listed? ? 'disabled' : "" }"
      btn += link_to 'Hire' , hire_job_application_path(app) , method: :post  ,  class:  " btn btn-md  btn-primary mt-12 margin-right-5 #{!app.interviewing? ? 'disabled' : "" }"
      if app.is_candidate_applicant? &&  !current_company.consultants.where(candidate_id: app.applicationable_id).present?
        btn += link_to 'Start On-Boarding' , new_job_application_consultant_path(app)  ,   class: "contract btn btn-md btn-default mt-12 margin-right-5 #{  !app.hired? || app.contract.present? ? 'disabled' : "" }"
      else
        btn += link_to 'Start Contract' , accept_job_application_path(app) , method: :post , remote: true ,   class: "contract btn btn-md btn-default mt-12 margin-right-5 #{  !app.hired? || app.contract.present? ? 'disabled' : "" }"
      end
      btn.to_s
    end
  end

end
