class Contract < ActiveRecord::Base

  attr_accessor :company_doc_ids

  #Associations
  belongs_to :created_by , class: 'User' , foreign_key: :created_by_id
  belongs_to :job_application
  belongs_to :job
  has_one    :company , through: :job
  has_many :attachable_docs, as: :documentable

  # Callbacks
  after_create :insert_attachable_docs


  private

    # after create
    def insert_attachable_docs
      company_docs = self.company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
      company_docs.each do |company_doc|
        self.attachable_docs.create(company_doc_id: company_doc.id , orignal_file: company_doc.attachment.try(:file))
      end
    end

end
