class JobApplication < ActiveRecord::Base

  enum status: { accepted: 1 , pending: 0  , rejected: 2 , short_listed: 3 }
  enum application_type: {direct: 0 , candidate_direct: 1 , vendor_direct: 2 , invitation: 3}

  belongs_to :job_invitation
  belongs_to :user
  belongs_to :job
  belongs_to :company
  has_one    :contract
  has_many   :custom_fields ,as: :customizable

  validates :cover_letter , presence: true
  # validates :application_type, inclusion: { in: application_types.keys }
  validates :status ,             inclusion: {in: statuses.keys}

  after_create :update_job_invitation_status ,     if: Proc.new{|application| application.job_invitation.present?}
  after_update :notify_recipient_on_status_change, if: Proc.new{|application| application.status_changed? && application.job_invitation.present?}
  after_create :set_application_type,              if: Proc.new{|application| application.job_invitation.present?}

  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank

  default_scope                { order(created_at: :desc) }
  scope :direct , -> {where(job_invitation_id: nil)}
  scope :candidate , -> {joins(:job_invitation).where('job_invitations.invitation_type = ?' , 1)}
  scope :vendor , -> {joins(:job_invitation).where('job_invitations.invitation_type = ?' , 0)}
  scope :by_email , -> {joins(:job_invitation).where('job_invitations.invitation_type = ?' , 2)}

  private

    def update_job_invitation_status
      self.job_invitation.accepted!
    end

    # Call after update
    def notify_recipient_on_status_change
      self.job_invitation.recipient.notifications.create(message: self.company.name + " has #{self.status} your Job Application - #{self.job.title}")
    end

    def set_application_type
      self.invitation!
    end

end
