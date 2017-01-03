module Company::JobApplicationsHelper
  def job_application_top_links(app)
    # status: [ :pending_review ,:rejected , :short_listed,:interviewing,:hired ]
    btn = ""
    btn += link_to 'Short list' ,short_list_job_application_path(app) , method: :post , disabled: !app.pending_review?   ,  class: ' short-list btn btn-md btn-default btn-primary mt-12 margin-right-5 '
    btn += link_to 'Reject' , reject_job_application_path(app) , method: :post ,  disabled: !app.pending_review? , class: 'reject btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn += link_to 'Interview' , interview_job_application_path(app) , method: :post ,  disabled: !app.short_listed? , class: ' interview btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn += link_to 'Hire' , hire_job_application_path(app) , method: :post ,  disabled: !app.interviewing? ,  class:  ' hire btn btn-md btn-default btn-primary mt-12 margin-right-5'
    btn += link_to 'Start Contract' , !(app.hired? && app.contract.blank?) ? '#' : accept_job_application_path(app) , method: :post , remote: true , disabled: !(app.hired? && app.contract.blank?) ,   class: ' contract btn btn-md btn-default mt-12 margin-right-5'
    btn.to_s
  end
end
