class JobApplication < ApplicationRecord

  include Rails.application.routes.url_helpers

  has_paper_trail only: [:rate_per_hour]
  include PublicActivity::Model
  enum status: [:applied, :short_listed, :prescreen, :rate_confirmation, :client_submission, :interviewing, :hired, :rejected, :pending_review]
  enum application_type: [:direct, :candidate_direct, :vendor_direct, :invitation, :witout_registration, :with_recurator]


  belongs_to :job_invitation, optional: true
  belongs_to :applicationable, polymorphic: true, optional: true
  belongs_to :job, optional: true
  belongs_to :company, optional: true
  belongs_to :recruiter_company, class_name: "Company", foreign_key: :recruiter_company_id, optional: true
  has_one :contract
  has_many :custom_fields, as: :customizable
  has_many :comments, as: :commentable
  has_many :chats, as: :chatable
  has_many :job_applicant_reqs
  has_many :job_applicantion_without_registrations
  has_one :conversation
  has_many :interviews
  has_many :document_signs, as: :part_of

  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy


  # validates :cover_letter , :applicant_resume ,presence: true
  validates :cover_letter, presence: true

  # validates :application_type, inclusion: { in: application_types.keys }
  validates :status, inclusion: {in: statuses.keys}
  validates_uniqueness_of :applicationable_id, scope: [:job_id, :applicationable_type], on: :create

  before_create :generate_share_key
  # before_create :set_application_type
  after_create :update_job_invitation_status, if: Proc.new {|application| application.job_invitation.present?}
  after_create :notify_job_owner_or_admins
  after_update :notify_recipient_on_status_change, if: Proc.new {|application| application.status_changed?}
  after_create :send_message
  accepts_nested_attributes_for :custom_fields, reject_if: :all_blank
  accepts_nested_attributes_for :job_applicant_reqs, reject_if: :all_blank
  accepts_nested_attributes_for :job_applicantion_without_registrations, reject_if: :all_blank


  default_scope {order(created_at: :desc)}
  scope :direct, -> {where(job_invitation_id: nil)}
  scope :candidate, -> {joins(:job_invitation).where('job_invitations.invitation_type = ?', 1)}
  scope :vendor, -> {joins(:job_invitation).where('job_invitations.invitation_type = ?', 0)}
  scope :by_email, -> {joins(:job_invitation).where('job_invitations.invitation_type = ?', 2)}

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
    self.job.created_by.notifications.create(notification_type: :new_application, createable: self.applicationable, message: self.applicationable.full_name + " has #{self.job_invitation.status.humanize} <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'> on your Job </a>#{self.job.title}", title: "Job Invitation")
  end

  # Call after update
  def notify_recipient_on_status_change
    self.applicationable.notifications.create(notification_type: :new_application, createable: self.job.company.owner, message: self.job.company.name + " has #{self.status.humanize} <a href='http://#{self.applicationable.etyme_url + job_application_path(self)}'> Job Application </a> #{self.job.title}", title: "Job Application")
  end

  def set_application_type
    self.application_type = self.job_invitation.present? ? 3 : self.applicationable.class.name == "Candidate" ? 1 : 2
  end

  def notify_job_owner_or_admins
    if self.applicationable.class.name == "Candidate"
      self.job.created_by.notifications.create(notification_type: :new_application, createable: self.applicationable, message: self.applicationable.full_name + " has <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'>apply</a> to your Job Application - #{self.job.title}", title: "Job Application")
    else
      self.job.company.all_admins_has_permission?('manage_job_applications').each do |admin|
        if self.applicationable_id.blank?
          admin.notifications.create(notification_type: :new_application, createable: self.applicationable, message: " has <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'>apply</a> your Job Application - #{self.job.title}", title: "Job Application")
        else
          admin.notifications.create(notification_type: :new_application, createable: self.applicationable, message: self.applicationable.company.name + " has <a href='http://#{self.job.created_by.company.etyme_url + job_application_path(self)}'>apply</a> your Job Application - #{self.job.title}", title: "Job Application")
        end
      end
    end
  end

  def number
    "JA-#{id}"
  end

  def is_rate_accepted?
    accept_rate and accept_rate_by_company
  end

  private

  def send_message
    if self.applicationable_id.blank?

    else
      chat = self.job.chat.chat_users.create(userable: self.try(:applicationable)) if self.job.chat.present?
      self.job.chat.messages.create(messageable: self.try(:applicationable), body: "#{self.try(:applicationable).try(:full_name)} has applied for your job with title #{self.job.title}") if self.job.chat.present?
    end
  end


end
