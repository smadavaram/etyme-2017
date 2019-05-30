class JobApplicationMailer < ApplicationMailer
  #Default Email
  default from: "no-reply@etyme.com"
  def submit_to_client(application_id, job_id,current_company)
    @job_application = JobApplication.find_by(id: application_id)
    @job = Job.find_by(id: job_id)
    @company = current_company
    mail(to: @job.source.strip, subject: "#{current_company.name.titleize} Submit a job application", from: "Etyme <no-reply@etyme.com>")
  end
end