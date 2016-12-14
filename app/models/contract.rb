class Contract < ActiveRecord::Base
  #Enum
  enum status:                { pending: 0, accepted: 1 , rejected: 2 , is_ended: 3  , cancelled: 4 , paused: 5 }
  enum billing_frequency:     { weekly: 0, by_weekly: 1 , monthly: 2 , by_monthly: 3 }
  # enum time_sheet_frequency:  { weekly: 0, by_weekly: 1 , monthly: 2 , by_monthly: 3 }

  attr_accessor :company_doc_ids

  #Associations
  belongs_to :created_by , class_name: 'User' , foreign_key: :created_by_id
  belongs_to :respond_by , class_name: 'User' , foreign_key: :respond_by_id
  belongs_to :job_application
  belongs_to :job
  belongs_to :location
  belongs_to :user
  belongs_to :company
  has_one    :job_invitation , through: :job_application
  has_many   :contract_terms , dependent: :destroy
  has_many   :timesheets     , dependent: :destroy
  has_many   :attachable_docs, as: :documentable

  # Callbacks
  after_create :insert_attachable_docs
  after_create :notify_recipient
  after_update :notify_on_status_change, if: Proc.new{|contract| contract.status_changed? && contract.respond_by.present?}
  after_create :update_contract_application_status
  after_save   :create_timesheet, if: Proc.new{|contract| contract.status_changed? && contract.accepted? && contract.is_not_ended? && !contract.timesheets.present?}

  #Scopes
  default_scope  -> {order(created_at: :desc)}
  scope :pending , -> {where(status: 0)}
  scope :accepted , -> {where(status: 1)}
  scope :rejected , -> {where(status: 2)}

  # Nested Attributes
  accepts_nested_attributes_for :contract_terms, allow_destroy: true ,reject_if: :all_blank

  def is_pending?
    status == 'pending'
  end

  def is_not_ended?
    self.end_date >= Date.today
  end


  private

    # after create
    def insert_attachable_docs
      company_docs = self.company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
      company_docs.each do |company_doc|
        self.attachable_docs.create(company_doc_id: company_doc.id , orignal_file: company_doc.attachment.try(:file))
      end
    end

    # Call after create
    def notify_recipient
      self.job_application.user.notifications.create(message: self.company.name+" send a contract offer for "+self.job.title ,title:"Contract- #{self.job.title}") if self.job_application.present?
    end

    # Call after update
    def notify_on_status_change
      self.created_by.notifications.create(message: self.respond_by.full_name+" has "+ self.status+" your contract request for "+self.job.title ,title:"Contract- #{self.job.title}")
    end

    # Call after create
    def update_contract_application_status
      self.job_application.accepted!
    end

    # Call in delay Job
    def schedule_timesheet
      self.timesheets.create(job_id: self.job.id ,start_date: self.start_date , company_id: self.job.company.id , status: 'open')
    end

    # Call after update if contract accepted.
    def create_timesheet
      self.delay(run_at: self.start_date).schedule_timesheet
      # schedule_timesheet
    end

    # Cron Job
    def self.ended
      Contract.where(end_date: Date.today).each do |contract|
        contract.is_ended!
      end
    end

end
