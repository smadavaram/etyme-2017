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

  def share_jobs(to, to_emails, job_ids, current_company, message)
    @link_list = []
    @message = message
    jobs = Job.where("id IN (?) AND end_date >= ? ",job_ids, Date.today)

    jobs.each do |job|
      @link_list.push({
                          title: job.title[0..50],
                          job_link: static_job_url(job).to_s,
                          category: job.job_category,
                          last_date: job.end_date,
                          location: job.location,
                          posted_by: (job.created_by.full_name  rescue "  --"),
                          status: job.is_active? ? "Active" : "Deactive"
                      })
    end
    @company = current_company
    mail(to: to,bcc: to_emails, subject: "#{current_company.name.titleize} Shared Jobs", from: "Etyme <no-reply@etyme.com>")
  end

end
