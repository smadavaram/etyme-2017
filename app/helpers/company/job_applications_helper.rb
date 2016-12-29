module Company::JobApplicationsHelper
  def job_application_top_links(app)
    # status: [ :pending_review ,:rejected , :short_listed,:interviewing,:hired ]
    btn = ""
    btn += link_to 'Short list' ,short_list_job_application_path(app) , method: :post , disabled: !app.pending_review?   ,  class: 'btn btn-md btn-default btn-danger mt-12 margin-right-5 '
    btn += link_to 'Reject' , reject_job_application_path(app) , method: :post  , disabled: !app.pending_review? , class: ' btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn += link_to 'Interview' , interview_job_application_path(app) , method: :post ,  disabled: !app.short_listed? , class: 'btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn += link_to 'Hire' , hire_job_application_path(app) , method: :post, disabled: !app.interviewing? ,  class:  'btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn += link_to 'Start Contract' , accept_job_application_path(app) , method: :post  , disabled: !app.hired? || app.contract.present? ,   class: '  btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn.to_s
  end
end
