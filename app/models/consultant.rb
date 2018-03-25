
class Consultant < User
  include PublicActivity::Model

  attr_accessor :company_doc_ids
  attr_accessor :resend_invitation

  enum visa_status: [:USC, :GC, :H1B, :EAD]
  enum relocation:  [:not_set,:open,:not_open]
  acts_as_taggable

  belongs_to :candidate
  has_one    :consultant_profile , dependent: :destroy
  has_many   :leaves , class_name: 'Leave' , foreign_key: :user_id ,dependent: :destroy
  has_many   :comments ,as: :commentable


  accepts_nested_attributes_for :consultant_profile , allow_destroy: true
  accepts_nested_attributes_for :address , reject_if: :all_blank

  validates :password,presence: true,if: Proc.new { |consultant| !consultant.password.nil? }
  validates :password_confirmation,presence: true,if: Proc.new { |consultant| !consultant.password.nil? }
  validates :max_working_hours, presence: true
  validates_numericality_of :max_working_hours, only_integer: true, greater_than_or_equal_to: 0 , less_than_or_equal_to: 86400

  after_create :insert_attachable_docs
  after_create :send_invitation
  before_validation  :convert_max_working_hours_to_seconds
  before_validation :hourly_rate , if: Proc.new { |consultant| consultant.consultant_profile.present? }


  def self.import(file , company , user)
    spreadsheet = open_spreadsheet(file)
    header = spreadsheet.row(1)
    (2..spreadsheet.last_row).each do |i|
      row = Hash[[header, spreadsheet.row(i)].transpose]
      # consultant = new(company_id: company.id , invited_by_id: user.id , invited_by_type: 'User' )
      invite!(row.to_hash.merge!(company_id: company.id ), user)
      # consultant.attributes = row.to_hash
      # consultant.save(validation: false)
    end
  end

  def salaried?
    self.consultant_profile.salaried?
  end

  def hourly_rate
    return self.salaried? ? (self.consultant_profile.salary)/(((self.max_working_hours)/3600.0)*20) : self.consultant_profile.salary
  end


  private

  def self.open_spreadsheet(file)
    case File.extname(file.original_filename)
      when ".csv" then Roo::Csv.new(file.path, packed: nil, file_warning: :ignore)
      when ".xls" then Roo::Excel.new(file.path, packed: nil, file_warning: :ignore)
      when ".xlsx" then Roo::Excelx.new(file.path, packed: nil, file_warning: :ignore)
      else raise "Unknown file type: #{file.original_filename}"
    end
  end
  def send_invitation
    invite! { |u| u.skip_invitation = true }
    UserMailer.invite_user(self).deliver
  end

  def insert_attachable_docs
    company_docs = self.company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
    company_docs.each do |company_doc|
      self.attachable_docs.find_or_create_by(company_doc_id: company_doc.id , orignal_file: company_doc.attachment.try(:file))
    end
  end

  def convert_max_working_hours_to_seconds
    self.max_working_hours = (self.temp_working_hours.to_f * 3600).to_i if temp_working_hours.present?
  end

end
