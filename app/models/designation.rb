# frozen_string_literal: true

class Designation < ActiveRecord::Base
  delegate :url_helpers, to: 'Rails.application.routes'
  after_create :notify_recruiter
  scope :with_no_client,-> { where(client_id: nil) }

  belongs_to :candidate
  belongs_to :client, optional: true
  enum confirmation: %i[unverified verified notified not_found]

  def notify_recruiter
    recruiter = User.find_by_email(recruiter_email)
    message = "Candidate #{candidate.email} has registered you as recruiter. If you want to accept <a href='#{url_helpers.accept_candidate_designation_url(id)}'>Click Here</a>."
    if recruiter
      recruiter_notification = recruiter.notifications.new(notification_type: 'invitation', createable: candidate, message: message, title: 'Invitation for Recruiter')
      notified! if recruiter_notification.save
    else
      not_found!
    end
  end
end
