class Designation < ActiveRecord::Base
  delegate :url_helpers, to: 'Rails.application.routes'
  after_create :notify_recruiter

  belongs_to :candidate

  enum confirmation: [:unverified, :verified, :notified, :not_found]

  def notify_recruiter
    recruiter = User.find_by_email(recruiter_email)
    message = "Candidate #{self.candidate.email} has registered you as recruiter. If you want to accept <a href='#{url_helpers.accept_candidate_designation_url(self.id)}'>Click Here</a>."
    if recruiter
      recruiter_notification = recruiter.notifications.new(notification_type: "invitation",createable: self.candidate,message: message, title: "Invitation for Recruiter")
      if recruiter_notification.save
        self.notified!
      end
    else
      self.not_found!
    end
  end

end