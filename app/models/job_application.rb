class JobApplication < ActiveRecord::Base

  enum status: [ :pending_review ,:rejected , :short_listed,:interviewing,:hired ]
  enum application_type: [:direct , :candidate_direct , :vendor_direct , :invitation]

  belongs_to :job_invitation
  belongs_to :applicationable, polymorphic: true
  belongs_to :job
  belongs_to :company
  has_one    :contract
  has_many   :custom_fields ,as: :customizable
  has_many   :comments ,as: :commentable

  attr_accessor :candidate_email
  attr_accessor :candidate_first_name
  attr_accessor :candidate_last_name

  validates :cover_letter , presence: true
  # validates :application_type, inclusion: { in: application_types.keys }
  validates :status ,             inclusion: {in: statuses.keys}

  after_create :update_job_invitation_status ,     if: Proc.new{|application| application.job_invitation.present?}
  after_update :notify_recipient_on_status_change, if: Proc.new{|application| application.status_changed? && application.job_invitation.present?}
  after_create :set_application_type,              if: Proc.new{|application| application.job_invitation.present?}
  after_create :create_candidate   ,               if: Proc.new{|application| application.applicationable_id.nil?}

  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank


  default_scope                { order(created_at: :desc) }
  scope :direct , -> {where(job_invitation_id: nil)}
  scope :candidate , -> {joins(:job_invitation).where('job_invitations.invitation_type = ?' , 1)}
  scope :vendor , -> {joins(:job_invitation).where('job_invitations.invitation_type = ?' , 0)}
  scope :by_email , -> {joins(:job_invitation).where('job_invitations.invitation_type = ?' , 2)}

  def is_candidate_applicant?
    self.applicationable.class.name == "Candidate"
  end

  def user
    self.applicationable
  end

  private

    def update_job_invitation_status
      self.job_invitation.accepted!
    end

    # Call after update
    def notify_recipient_on_status_change
      self.job_invitation.recipient.notifications.create(message: self.job_invitation.company.name + " has #{self.status} your Job Application - #{self.job.title}")
    end

    def set_application_type
      self.invitation!
    end

    def create_candidate

      if Candidate.find_by_email(self.candidate_email).present?

      else
        puts self.candidate_email
        Candidate.create(email: self.candidate_email ,first_name: self.candidate_first_name ,last_name: self.candidate_last_name)

      end
    end



end
