# frozen_string_literal: true

# == Schema Information
#
# Table name: jobs
#
#  id                      :integer          not null, primary key
#  title                   :string
#  description             :text
#  location                :string
#  start_date              :date
#  end_date                :date
#  parent_job_id           :integer
#  company_id              :integer
#  created_by_id           :integer
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  is_public               :boolean          default(TRUE)
#  job_category            :string
#  is_system_generated     :boolean          default(FALSE)
#  deleted_at              :datetime
#  video_file              :string
#  industry                :string
#  department              :string
#  price                   :decimal(, )
#  job_type                :string
#  ref_job_id              :integer
#  is_bench_job            :boolean
#  comp_video              :string
#  listing_type            :string           default("Job")
#  status                  :string
#  media_type              :string
#  conversation_id         :bigint
#  source                  :string
#  is_indexed              :boolean          default(FALSE)
#  files                   :text
#  latitude                :float
#  longitude               :float
#  created_by_candidate_id :integer
#
class Job < ApplicationRecord
  STATUSES  = { draft: 'Draft', bench: 'Bench', published: 'Published', archived: 'Archived', cancelled: 'Cancelled' }

  enum blog_type: [:about_us, :contact, :privacy, :terms]
  enum work_type: %i[onsite remote hybrid]
  # validates :end_date , presence: true , if: Proc.new{ |job| !job.is_system_generated }
  validates :title, presence: true
  # add a validation to ensure that only one blog can be 'about_us'
  validates_uniqueness_of :blog_type, scope: :company_id, conditions: -> { where(blog_type: :about_us, listing_type: "Blog") }
  validates_uniqueness_of :blog_type, scope: :company_id, conditions: -> { where(blog_type: :contact, listing_type: "Blog") }
  validates_uniqueness_of :blog_type, scope: :company_id, conditions: -> { where(blog_type: :privacy, listing_type: "Blog") }
  validates_uniqueness_of :blog_type, scope: :company_id, conditions: -> { where(blog_type: :terms, listing_type: "Blog") }
  # validates :start_date, presence: true, date: { after_or_equal_to: Proc.new { Date.today }, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :end_date, presence: true, date: { after_or_equal_to: :start_date, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :start_date,:end_date, date: { allow_blank: false, message:"Date must be present" }
  validate :file_size

  belongs_to :created_by, class_name: 'User', foreign_key: :created_by_id, optional: true
  belongs_to :created_by_candidate, class_name: 'Candidate', foreign_key: :created_by_candidate_id, optional: true
  belongs_to :company, optional: true
  # belongs_to   :location
  has_many :contracts, dependent: :destroy
  has_many :job_applications, dependent: :destroy
  has_many :timesheets, dependent: :destroy
  has_many :client_expenses, dependent: :destroy
  # has_many     :received_job_applications, class_name: 'JobApplication', s
  has_many :job_invitations, dependent: :destroy
  has_many :custom_fields, as: :customizable
  has_and_belongs_to_many :matches, class_name: 'Candidate'
  # has_many     :job_applications ,through: :job_invitations
  has_many :timesheet_approvers, through: :timesheets
  has_many :job_requirements
  has_one :conversation

  # has_many     :applicants , through: :job_applications , source: :applicationable ,source_type: "Candidate"
  has_one :chat, as: :chatable, dependent: :destroy

  has_many :comments, as: :commentable

  accepts_nested_attributes_for :custom_fields, reject_if: :all_blank
  accepts_nested_attributes_for :job_requirements, reject_if: :all_blank, allow_destroy:true


  acts_as_taggable_on :education
  acts_as_taggable
  #acts_as_paranoid # disable DELETED AT using paranoia gem

  mount_uploader :video_file, JobvideoUploader

  after_create :create_job_chat
  after_create :create_job_conversation
  after_create :start_matching_candidates, if: proc { |job| job.listing_type == 'Job' and job.status == 'Published' }
  before_update :start_matching_candidates, if: proc { |job| (job.listing_type == 'Job' and job.status == 'Published') and (job.tag_list_changed? or job.industry_changed? or job.department_changed?) }
  before_save :set_parent_job

  scope :active, -> { where('end_date>=? AND status = ?', Date.today, 'Published') }
  scope :expired, -> { where('end_date<?', Date.today) }
  scope :is_public, -> { where(is_public: true) }
  scope :not_system_generated, -> { where(is_system_generated: false) }

  # scope :search_by, ->(term, _search_scop) { Job.joins(:tags).where('lower(tags.name) like :term or lower(title) like :term or lower(description) like :term or lower(location) like :term or lower(job_category) like :term', term: "#{term&.downcase}%") }
  scope :search_by, ->(term) { Job.joins(:tags).where('lower(tags.name) like :term or lower(title) like :term or lower(description) like :term or lower(location) like :term or lower(job_category) like :term', term: "#{term&.downcase}%") }
  scope :search_with, ->(term) { where('lower(title) like :term or lower(description) like :term or lower(location) like :term or lower(job_category) like :term', term: "#{term&.downcase}%").distinct }

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
    return unless source.present? && source.match(/^[\s]*http/)

    id = source.match(/([0-9]+)$/)[1].to_i
    self.parent_job_id = id if Job.exists?(id)
  end

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def file_size
    errors.add(:video_file, 'You cannot upload a file greater than 2MB') if video_file.present? && video_file.file.size.to_f / (1000 * 1000) > 2
  end

  def is_published?
    status == 'Published'
  end

  def is_active?
    end_date.nil? ? true : end_date >= Date.today
  end

  def self.find_or_create_sub_job(company, user, job_object)
    company.jobs.find_or_create_by(parent_job_id: job_object.id) do |job|
      job.title = 'Sub Job ' + job_object.title
      job.description = job_object.description
      job.job_category = job_object.job_category
      job.start_date = job_object.start_date
      job.end_date = job_object.end_date
      job.parent_job_id = job_object.id
      job.created_by_id = user.id
      job.is_public = false
      job.is_system_generated = false
    end
  end

  def is_child?
    parent_job_id.present?
  end

  def self.share_jobs(to, to_emails, c_ids, current_company, message, subject)
    JobMailer.share_jobs(to, to_emails, c_ids, current_company, message, subject).deliver
  end

  def create_job_conversation
    group = nil
    Group.transaction do
      group = company.groups.create(group_name: "J-#{id} #{title}", member_type: 'Chat')
      company.users.joins(:permissions).where("permissions.name": 'manage_jobs').each do |user|
        group.groupables.create(groupable: user)
      end
    end
    build_conversation(chatable: group, topic: :Job, job_id: id).save if group
  end

  def self.archived
    Job.where(status: 'Published').each do | job |
      unless job.job_applications.where('updated_at >= ?', 7.day.ago.to_datetime).any? || (job.updated_at > 7.day.ago.to_datetime)
        job.update(status: "Archived")
      end
    end
  end

  def start_matching_candidates
    CandidateJobMatchWorker.perform_async(self.id, 'Job')
  end
  
  def matched_candidates
    candidates = Candidate.all
    job_tags = tag_list.map(&:downcase) 

    matched = []
    candidates.each do |candidate|
      percentage = 0
      matched_skills = candidate.skill_list.map(&:downcase) & job_tags

      unless matched_skills.empty?
        skill_percentage = (matched_skills.count.to_f/job_tags.count.to_f)*100 unless (job_tags.count - matched_skills.count).zero?
        percentage = skill_percentage*0.6 unless skill_percentage.nil?
        
        percentage += 20 if !department&.empty? and candidate.dept_name == department
        percentage += 20 if !industry&.empty? and candidate.industry_name == industry
        matched << {:candidate => candidate, :percentage => percentage.round(2)} unless percentage.zero?
      end
    end
    matched.sort_by {|match| match[:percentage]}.reverse!
    self.matches = matched.map {|match| match[:candidate] }
  end

  private

  def create_job_chat
    create_chat(company: company)

    job_created_by = created_by || created_by_candidate

    try(:chat).try(:chat_users).create(userable: job_created_by)
    try(:chat).try(:messages).create(messageable: job_created_by, body: "#{job_created_by.full_name} created Job #{title.humanize}")
  end
end
