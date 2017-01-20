class JobApplication < ActiveRecord::Base

  include Rails.application.routes.url_helpers

  enum status: [ :pending_review ,:rejected , :short_listed,:interviewing,:hired ]
  enum application_type: [:direct , :candidate_direct , :vendor_direct , :invitation]

  belongs_to :job_invitation
  belongs_to :applicationable, polymorphic: true
  belongs_to :job
  belongs_to :company
  has_one    :contract
  has_many   :custom_fields ,as: :customizable
  has_many   :comments ,as: :commentable

  validates :cover_letter , presence: true
  # validates :application_type, inclusion: { in: application_types.keys }
  validates :status ,             inclusion: {in: statuses.keys}
  validates_uniqueness_of :applicationable_id,scope: [:job_id,:applicationable_type] ,on: :create

  after_create :update_job_invitation_status ,     if: Proc.new{|application| application.job_invitation.present?}
  after_create :notify_job_owner_or_admins
  after_update :notify_recipient_on_status_change, if: Proc.new{|application| application.status_changed? }
  before_create :set_application_type

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

  # private

    def update_job_invitation_status
      self.job_invitation.accepted!
    end

    # Call after update
    def notify_recipient_on_status_change
        self.applicationable.notifications.create(message: self.job.company.name + " has #{self.status.humanize} <a href='http://#{self.applicationable.etyme_url + job_application_path(self)}'> Job Application </a> #{self.job.title}",title:"Job Application")
    end

    def set_application_type
      if self.job_invitation.present?
        self.status = 'invitation'
      elsif self.applicationable.class.name == "Candidate"
        self.status = 'candidate_direct'
      else
        self.status =  'vendor_direct'
      end
    end

    def notify_job_owner_or_admins
      if self.applicationable.class.name == "Candidate"
        self.job.created_by.notifications.create(message: self.applicationable.full_name + " has <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'>apply</a> to your Job Application - #{self.job.title}",title:"Job Application")
      else
        self.job.company.all_admins_has_permission?('manage_job_applications').each  do |admin|
          admin.notifications.create(message: self.applicationable.company.name + " has <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'>apply</a> your Job Application - #{self.job.title}",title:"Job Application")
        end
      end
    end


end
