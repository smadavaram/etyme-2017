# frozen_string_literal: true

class JobMailer < ApplicationMailer
  def send_job_invitation(job_invitation)
    @company   = job_invitation.company
    @job       = job_invitation.job
    @vendor    = job_invitation.recipient
    @created_by = job_invitation.created_by
    mail(to: @vendor.email, subject: 'Job Invitation')
  end

  def send_confirmation_receipt(job)
    @job = job
    mail(to: @job.created_by.email, subject: 'Job Creation Reciept Through Email')
  end

  def share_jobs(to, to_emails, job_ids, current_company, message, subject)
    @link_list = []
    @message = message
    @subject = subject
    jobs = Job.where('id IN (?) AND (DATE(end_date) >= ? OR end_date IS NULL) ', job_ids, Date.today)
    jobs.each do |job|
      @link_list.push(
        title: job.title[0..50],
        job_link: static_job_url(job).to_s,
        category: job.job_category,
        last_date: job.end_date,
        location: job.location,
        posted_by: (begin
                        job.created_by.full_name
                    rescue StandardError
                      '  --'
                      end),
        status: job.is_active? ? 'Active' : 'Deactive'
      )
    end
    @company = current_company
    mail(to: to, bcc: to_emails, subject: "#{current_company.name.titleize} #{subject}")
  end
end
