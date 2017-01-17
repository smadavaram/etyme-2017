class JobMailer < ApplicationMailer
  #Default Email
  default from: "no-reply@etyme.com"

  def send_job_invitation(job_invitation)
    @company   = job_invitation.company
    @job       = job_invitation.job
    @vendor    = job_invitation.recipient
    @created_by= job_invitation.created_by
    mail(to: @vendor.email,  subject: "Job Invitation" , from: "Etyme <no-reply@etyme.com>")
  end
end
