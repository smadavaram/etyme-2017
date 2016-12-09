class JobApplication < ActiveRecord::Base

  enum status: { accepted: 1 , pending: 0  , rejected: 2 , short_listed: 3 }
  enum application_type: {direct: 0 , candidate_direct: 1 , vendor_direct: 2 , invitation: 3}

  #Association
  belongs_to :job_invitation
  belongs_to :user
  belongs_to :job
  belongs_to :company
  has_one    :contract
  has_many   :custom_fields ,as: :customizable


  #validation
  validates :cover_letter , presence: true

  #CallBacks
  after_create :update_job_invitation_status ,     if: Proc.new{|application| application.job_invitation.present?}
  after_update :notify_recipient_on_status_change, if: Proc.new{|application| application.status_changed? && application.job_invitation.present?}
  after_create :set_application_type,              if: Proc.new{|application| application.job_invitation.present?}

  #Nested Attributes
  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank

  # Scopes
  default_scope                { order(created_at: :desc) }
  scope :pending          , -> {where(status: 0)}
  scope :accepted         , -> {where(status: 1)}
  scope :rejected         , -> {where(status: 2)}
  scope :short_list       , -> {where(status: 3)}
  scope :candidate_direct , -> {where(application_type: 1)}
  scope :invitation       , -> {where(application_type: 3)}

  def is_pending?
    self.pending?
  end

  def is_accepted?
    self.accepted?
  end

  def is_rejected?
    self.rejected?
  end


  private

    # Call after create
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
