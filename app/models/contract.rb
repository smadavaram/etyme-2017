class Contract < ActiveRecord::Base

  enum status:           [ :pending, :accepted , :rejected , :is_ended  , :cancelled , :paused , :in_progress]
  enum billing_frequency:     [ :weekly, :bi_weekly , :monthly , :bi_monthly ]
  enum commission_type:  [:percentage, :fixed]

  attr_accessor :company_doc_ids

  belongs_to :created_by , class_name: 'User' , foreign_key: :created_by_id
  belongs_to :respond_by , class_name: 'User' , foreign_key: :respond_by_id
  belongs_to :assignee   , class_name: 'User' , foreign_key: :assignee_id
  belongs_to :job_application
  belongs_to :job
  belongs_to :location
  belongs_to :user
  belongs_to :company
  has_one    :job_invitation , through: :job_application
  has_many   :contract_terms , dependent: :destroy
  has_many   :timesheets     , dependent: :destroy
  has_many   :invoices       , dependent: :destroy
  has_many   :timesheet_logs , through: :timesheets
  has_many   :transactions   , through: :timesheets
  has_many   :timesheet_approvers   , through: :timesheets
  has_many   :attachable_docs, as: :documentable
  has_many   :attachments , as: :attachable

  after_create :insert_attachable_docs
  after_create :notify_recipient
  after_update :notify_on_status_change, if: Proc.new{|contract| contract.status_changed? && contract.respond_by.present?}
  after_create :update_contract_application_status
  after_save   :create_timesheet, if: Proc.new{|contract| contract.status_changed? && contract.is_not_ended? && !contract.timesheets.present? && contract.next_invoice_date.nil?}

  default_scope  -> {order(created_at: :desc)}

  validate :date_validation
  validates :status ,             inclusion: {in: statuses.keys}
  validates :billing_frequency ,  inclusion: {in: billing_frequencies.keys}
  # validates :time_sheet_frequency,inclusion: {in: billing_frequencies.keys}
  validates :commission_type ,    inclusion: {in: commission_types.keys}
  validates :is_commission,       inclusion: { in: [ true, false ] }
  validates :start_date,  presence:   true
  validates :end_date,    presence:   true
  validates :commission_amount , :max_commission , numericality: true  , presence: true , if: Proc.new{|contract| contract.is_commission}


  accepts_nested_attributes_for :contract_terms, allow_destroy: true ,reject_if: :all_blank
  accepts_nested_attributes_for :attachments ,allow_destroy: true,reject_if: :all_blank

  def is_not_ended?
    self.end_date >= Date.today
  end

  def title
    self.job.title + " Job - Contract # " + self.id.to_s
  end

  def rate
    self.contract_terms.active.first.rate
  end

  def note
    self.contract_terms.active.first.note
  end

  def terms_and_conditions
    self.contract_terms.active.first.terms_condition
  end

  # private

  def insert_attachable_docs
    company_docs = self.company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
    company_docs.each do |company_doc|
      self.attachable_docs.create(company_doc_id: company_doc.id , orignal_file: company_doc.attachment.try(:file))
    end
  end

  def notify_recipient
    self.job_application.user.notifications.create(message: self.company.name+" sent a contract offer for "+self.job.title ,title: self.title) if self.job_application.present?
  end

  def notify_on_status_change
    self.created_by.notifications.create(message: self.respond_by.full_name+" has "+ self.status+" your contract request for "+self.job.title ,title:"Contract- #{self.job.title}")
  end

  def date_validation
    if self.end_date < self.start_date
      errors.add(:start_date, ' cannot be less than end date.')
      return false
    else
      return true
    end
  end

  def update_contract_application_status
    self.job_application.accepted!
  end

  def schedule_timesheet
    if self.job_application.user.class.name == "Candidate"
      self.timesheets.create!(user_id: self.job_application.user.id , job_id: self.job.id ,start_date: self.start_date , status: 'open')
    else
      self.timesheets.create!(user_id: self.job_application.user.id , job_id: self.job.id ,start_date: self.start_date , company_id: self.job_application.user.company.id , status: 'open')
    end
  end

  def create_timesheet
    self.update_column(:next_invoice_date, self.start_date + TIMESHEET_FREQUENCY[self.time_sheet_frequency].days + 2.days)
    self.delay(run_at: self.start_date.to_time).schedule_timesheet
  end

  def self.end_contracts
    Contract.where(end_date: Date.today).each do |contract|
      contract.is_ended!
    end
  end

  def self.start_contracts
    Contract.where(start_date: Date.today).each do |contract|
      contract.in_progress!
    end
  end

  def self.invoiced_timesheets
    self.in_progress.where(next_invoice_date: Date.today).each do |contract|
      contract.invoices.create!
    end
  end


end
