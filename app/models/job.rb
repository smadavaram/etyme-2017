class Job < ApplicationRecord

  # validates :end_date , presence: true , if: Proc.new{ |job| !job.is_system_generated }
  validates :title, presence: true
  # validates :start_date, presence: true, date: { after_or_equal_to: Proc.new { Date.today }, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :end_date, presence: true, date: { after_or_equal_to: :start_date, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :start_date,:end_date, date: { allow_blank: false, message:"Date must be present" }
  validate :file_size

  belongs_to :created_by, class_name: "User", foreign_key: :created_by_id, optional: true
  belongs_to :company, optional: true
  # belongs_to   :location
  has_many :contracts, dependent: :destroy
  has_many :job_applications, dependent: :destroy
  has_many :timesheets, dependent: :destroy
  has_many :client_expenses, dependent: :destroy
  # has_many     :received_job_applications, class_name: 'JobApplication', s
  has_many :job_invitations, dependent: :destroy
  has_many :custom_fields, as: :customizable
  # has_many     :job_applications ,through: :job_invitations
  has_many :timesheet_approvers, through: :timesheets
  has_many :job_requirements
  has_one :conversation

  # has_many     :applicants , through: :job_applications , source: :applicationable ,source_type: "Candidate"
  has_one :chat, as: :chatable, dependent: :destroy

  accepts_nested_attributes_for :custom_fields, reject_if: :all_blank
  accepts_nested_attributes_for :job_requirements, reject_if: :all_blank

  acts_as_taggable_on :education
  acts_as_taggable
  acts_as_paranoid

  mount_uploader :video_file, JobvideoUploader

  after_create :create_job_chat
  after_create :create_job_conversation
  before_save :set_parent_job

  scope :active, -> {where('end_date>=? AND status = ?', Date.today, "Published")}
  scope :expired, -> {where('end_date<?', Date.today)}
  scope :is_public, -> {where(is_public: true)}
  scope :not_system_generated, -> {where(is_system_generated: false)}

  scope :search_by, ->term,search_scop { Job.joins(:tags).where('lower(tags.name) like :term or lower(title) like :term or lower(description) like :term or lower(location) like :term or lower(job_category) like :term', {term: "#{term&.downcase}%"})}

  geocoded_by :location
  after_validation :geocode




  # def self.ransackable_attributes(auth_object = nil)
  #   if auth_object == :admin
  #     # whitelist all attributes for admin
  #     super
  #   else
  #     # whitelist only the title and body attributes for other users
  #     super & %w(title id)
  #   end
  # end

  # private_class_method :ransackable_attributes

  def set_parent_job
    if source.present? and source.match(/^[\s]*http/)
      id = source.match(/([0-9]+)$/)[1].to_i
      self.parent_job_id = id if Job.exists?(id)
    end
  end

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def file_size
    if video_file.present? && video_file.file.size.to_f / (1000 * 1000) > 2
      errors.add(:video_file, "You cannot upload a file greater than 2MB")
    end
  end

  def is_published?
    status == "Published"
  end
  
  def is_active?
    self.end_date.nil? ? true : self.end_date >= Date.today
  end

  def self.find_or_create_sub_job(company, user, j)
    company.jobs.find_or_create_by(parent_job_id: j.id) do |job|
      job.title = 'Sub Job ' + j.title
      job.description = j.description
      job.job_category = j.job_category
      job.start_date = j.start_date
      job.end_date = j.end_date
      job.parent_job_id = j.id
      job.created_by_id = user.id
      job.is_public = false
      job.is_system_generated = false
    end
  end

  def is_child?
    self.parent_job_id.present?
  end

  def self.share_jobs(to, to_emails, c_ids, current_company, message, subject)
    JobMailer.share_jobs(to, to_emails, c_ids, current_company, message, subject).deliver
  end

  def create_job_conversation
    group = nil
    Group.transaction do
      group = company.groups.create(group_name: "J-#{id} #{title}", member_type: 'Chat')
      company.users.joins(:permissions).where("permissions.name": "manage_jobs").each do |user|
        group.groupables.create(groupable: user)
      end
    end
    self.build_conversation({chatable: group, topic: :Job, job_id: id}).save if group
  end

  private
  def create_job_chat
    self.create_chat(company: self.company)
    self.try(:chat).try(:chat_users).create(userable: self.try(:created_by))
    self.try(:chat).try(:messages).create(messageable: self.try(:created_by), body: "#{self.created_by.full_name} created Job #{self.title.humanize}")
  end

end
