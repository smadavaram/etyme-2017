class AttachableDoc < ActiveRecord::Base

  #Associations
  belongs_to :company_doc
  belongs_to :documentable, polymorphic: true

  #Validations
end
