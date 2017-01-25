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

  validates :cover_letter , :applicant_resume ,presence: true
  # validates :application_type, inclusion: { in: application_types.keys }
  validates :status ,             inclusion: {in: statuses.keys}
  validates_uniqueness_of :applicationable_id,scope: [:job_id,:applicationable_type] ,on: :create

  before_create :generate_share_key
  before_create :set_application_type
  after_create :update_job_invitation_status ,     if: Proc.new{|application| application.job_invitation.present?}
  after_create :notify_job_owner_or_admins
  after_update :notify_recipient_on_status_change, if: Proc.new{|application| application.status_changed? }

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

    def generate_share_key
      begin
        self.share_key = Digest::MD5.hexdigest(self.id.to_s + Time.now.to_i.to_s + rand(0..9999).to_s)
      end while JobApplication.exists?(share_key: self.share_key)
    end

    def update_job_invitation_status
      self.job_invitation.accepted!
      self.job.created_by.notifications.create(message: self.applicationable.full_name+" has #{self.job_invitation.status.humanize} <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'> on your Job </a>#{self.job.title}",title:"Job Invitation")
    end

    # Call after update
    def notify_recipient_on_status_change
        self.applicationable.notifications.create(message: self.job.company.name + " has #{self.status.humanize} <a href='http://#{self.applicationable.etyme_url + job_application_path(self)}'> Job Application </a> #{self.job.title}",title:"Job Application")
    end

    def set_application_type
      self.application_type = self.job_invitation.present? ? 3 : self.applicationable.class.name == "Candidate" ? 1 : 2
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
