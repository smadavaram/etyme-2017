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

  #Validations
  validates :title , :end_date , presence: true
  # validates :start_date, presence: true, date: { after_or_equal_to: Proc.new { Date.today }, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :end_date, presence: true, date: { after_or_equal_to: :start_date, message: "must be at least #{(Date.today + 1).to_s}" }, on: :create
  # validates :start_date,:end_date, date: { allow_blank: false, message:"Date must be present" }

  #Associations
  belongs_to   :created_by , class_name: "User" ,foreign_key: :created_by_id
  belongs_to   :company
  belongs_to   :location
  has_many     :contracts        ,dependent: :destroy
  has_many     :job_applications ,dependent: :destroy
  has_many     :job_invitations  ,dependent: :destroy
  has_many     :custom_fields    ,as: :customizable
  has_many     :job_applications ,through: :job_invitations

  #Nested Attributes
  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank

  # Tagable
  acts_as_taggable


  #Scopes
   scope :active ,   -> { where('end_date>=?',Date.today) }
   scope :expired,   -> { where('end_date<?',Date.today) }
   scope :is_public, -> { where(is_public: true)}


end
