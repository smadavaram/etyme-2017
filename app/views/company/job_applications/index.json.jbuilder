# # json.array! @company_jobs, partial: 'jobs/_job', as: :company_job
#
#
json.data @job_applications do |application|
  json.job_title            application.job.title
  json.job_tags             application.job.tag_list
  json.job_description      application.job.description
  json.job_start_date       application.job.start_date.strftime('%b %d, %Y')
  json.job_end_date         application.job.end_date.strftime('%b %d, %Y')
  json.is_public            application.job.is_public ? "Public" : "Private"
  json.job_invitation       application.job_invitation
  json.company              application.job_invitation.recipient.company
  json.recipient            application.job_invitation.recipient
  json.message              application.job_invitation.message
  json.cover_letter         application.cover_letter
  json.status               "<span class='label label-success'>#{application.status}</span>"
  json.location             application.job.location
  json.action               application.is_pending? ? "<button class='btn btn-xs'>Open case</button> #{link_to 'Reject' , reject_job_application_job_job_invitation_job_application_path(application.job  , application.job_invitation , application) , method: :post , remote: true , class:'btn btn-xs btn-danger pull-right' , style: 'margin-left: 5px'} #{link_to 'Accept' , accept_job_application_job_job_invitation_job_application_path(application.job  , application.job_invitation , application) , method: :post , remote: true , class:'btn btn-xs btn-success pull-right'}" : "<button class='btn btn-xs'>#{application.status}</button>"
end
