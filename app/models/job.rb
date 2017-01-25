# == Schema Information
#
# Table name: jobs
#
#  id          :integer          not null, primary key
#  title       :string
#  description :text
#  country     :string
#  zip_code    :string
#  state       :string
#  city        :string
#  start_date  :date
#  end_date    :date
#  user_id     :integer
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#

class Job < ActiveRecord::Base

  validates :end_date , presence: true , if: Proc.new{ |job| !job.is_system_generated }
  validates :title , presence: true
  # validates :start_date, presence: true, date: { after_or_equal_to: Proc.new { Date.today }, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :end_date, presence: true, date: { after_or_equal_to: :start_date, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :start_date,:end_date, date: { allow_blank: false, message:"Date must be present" }

  belongs_to   :created_by , class_name: "User" ,foreign_key: :created_by_id
  belongs_to   :company
  # belongs_to   :location
  has_many     :contracts        ,dependent: :destroy
  has_many     :job_applications ,dependent: :destroy
  has_many     :timesheets       ,dependent: :destroy
  # has_many     :received_job_applications, class_name: 'JobApplication', s
  has_many     :job_invitations  ,dependent: :destroy
  has_many     :custom_fields    ,as: :customizable
  # has_many     :job_applications ,through: :job_invitations
  has_many     :timesheet_approvers,through: :timesheets

  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank

  acts_as_taggable
  acts_as_paranoid

   scope :active ,   -> { where('end_date>=?',Date.today) }
   scope :expired,   -> { where('end_date<?',Date.today) }
   scope :is_public, -> { where(is_public: true)}
   scope :not_system_generated , -> {where(is_system_generated: false)}

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

  def is_active?
    self.end_date >= Date.today
  end

  def self.find_or_create_sub_job(company , user , j)
    company.jobs.find_or_create_by(parent_job_id: j.id) do |job|
      job.title        = 'Sub Job '+ j.title
      job.description  =  j.description
      job.job_category =  j.job_category
      job.start_date   =  j.start_date
      job.end_date     =  j.end_date
      job.parent_job_id=  j.id
      job.created_by_id=  user.id
      job.is_public    =  false
      job.is_system_generated =  true
    end
  end

  def is_child?
    self.parent_job_id.present?
  end

end
