# frozen_string_literal: true

# == Schema Information
#
# Table name: users
#
#  id                     :integer          not null, primary key
#  company_id             :integer
#  first_name             :string           default("")
#  last_name              :string           default("")
#  gender                 :integer
#  email                  :string           default(""), not null
#  type                   :string
#  phone                  :string
#  primary_address_id     :integer
#  photo                  :string
#  signature              :json
#  status                 :integer
#  dob                    :date
#  encrypted_password     :string           default(""), not null
#  reset_password_token   :string
#  reset_password_sent_at :datetime
#  remember_created_at    :datetime
#  sign_in_count          :integer          default(0), not null
#  current_sign_in_at     :datetime
#  last_sign_in_at        :datetime
#  current_sign_in_ip     :string
#  last_sign_in_ip        :string
#  confirmation_token     :string
#  confirmed_at           :datetime
#  confirmation_sent_at   :datetime
#  unconfirmed_email      :string
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  invitation_token       :string
#  invitation_created_at  :datetime
#  invitation_sent_at     :datetime
#  invitation_accepted_at :datetime
#  invitation_limit       :integer
#  invited_by_type        :string
#  invited_by_id          :integer
#  invitations_count      :integer          default(0)
#  skills                 :string
#  ssn                    :string
#  max_working_hours      :integer          default(28800)
#  time_zone              :string
#  candidate_id           :integer
#  deleted_at             :datetime
#  visa_status            :integer
#  availability           :date
#  relocation             :integer          default("not_set")
#  age                    :integer
#  video                  :string
#  resume                 :string
#  video_type             :string
#  chat_status            :string
#  temp_pass              :string
#  ancestry               :string
#  stripe_charge_id       :integer
#  paid                   :boolean
#  online                 :boolean          default(TRUE)
#  provider               :string
#  uid                    :string
#  online_user_status     :string
#
class Consultant < User
  include PublicActivity::Model

  attr_accessor :company_doc_ids
  attr_accessor :resend_invitation
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  enum visa_status: %i[USC GC H1B EAD]
  enum relocation:  %i[not_set open not_open]
  acts_as_taggable

  belongs_to :candidate, optional: true
  has_one    :consultant_profile, dependent: :destroy
  has_many   :leaves, class_name: 'Leave', foreign_key: :user_id, dependent: :destroy
  has_many   :comments, as: :commentable

  accepts_nested_attributes_for :consultant_profile, allow_destroy: true
  accepts_nested_attributes_for :address, reject_if: :all_blank

  validates :password, presence: true, if: proc { |consultant| !consultant.password.nil? }
  validates :password_confirmation, presence: true, if: proc { |consultant| !consultant.password.nil? }
  validates :max_working_hours, presence: true
  validates_numericality_of :max_working_hours, only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 86_400

  after_create :insert_attachable_docs
  after_create :send_invitation
  before_validation :convert_max_working_hours_to_seconds
  before_validation :hourly_rate, if: proc { |consultant| consultant.consultant_profile.present? }

  def self.import(file, company, user)
    spreadsheet = open_spreadsheet(file)
    header = spreadsheet.row(1)
    (2..spreadsheet.last_row).each do |i|
      row = Hash[[header, spreadsheet.row(i)].transpose]
      # consultant = new(company_id: company.id , invited_by_id: user.id , invited_by_type: 'User' )
      invite!(row.to_hash.merge!(company_id: company.id), user)
      # consultant.attributes = row.to_hash
      # consultant.save(validation: false)
    end
  end

  def salaried?
    consultant_profile.salaried?
  end

  def hourly_rate
    salaried? ? consultant_profile.salary / ((max_working_hours / 3600.0) * 20) : consultant_profile.salary
  end

  def self.open_spreadsheet(file)
    case File.extname(file.original_filename)
    when '.csv' then Roo::Csv.new(file.path, packed: nil, file_warning: :ignore)
    when '.xls' then Roo::Excel.new(file.path, packed: nil, file_warning: :ignore)
    when '.xlsx' then Roo::Excelx.new(file.path, packed: nil, file_warning: :ignore)
    else raise "Unknown file type: #{file.original_filename}"
    end
  end

  def send_invitation
    invite! { |u| u.skip_invitation = true }
    UserMailer.invite_user(self).deliver
  end

  def insert_attachable_docs
    company_docs = company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
    company_docs.each do |company_doc|
      attachable_docs.find_or_create_by(company_doc_id: company_doc.id, orignal_file: company_doc.attachment.try(:file))
    end
  end

  def convert_max_working_hours_to_seconds
    self.max_working_hours = (temp_working_hours.to_f * 3600).to_i if temp_working_hours.present?
  end
end
