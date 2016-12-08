class Contract < ActiveRecord::Base
  #Enum
  enum status:                { pending: 0, accepted: 1 , rejected: 2 }
  enum billing_frequency:     { weekly: 0, by_weekly: 1 , monthly: 2 , by_monthly: 3 }
  # enum time_sheet_frequency:  { weekly: 0, by_weekly: 1 , monthly: 2 , by_monthly: 3 }

  attr_accessor :company_doc_ids

  #Associations
  belongs_to :created_by , class_name: 'User' , foreign_key: :created_by_id
  belongs_to :respond_by , class_name: 'User' , foreign_key: :respond_by_id
  belongs_to :job_application
  belongs_to :job
  belongs_to :location
  has_one    :company        , through: :job
  has_one    :job_invitation , through: :job_application
  has_many   :contract_terms , dependent: :destroy
  has_many   :attachable_docs, as: :documentable

  # Callbacks
  after_create :insert_attachable_docs
  after_create :notify_recipient
  after_update :notify_on_status_change, if: Proc.new{|application| application.status_changed?}

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

end
