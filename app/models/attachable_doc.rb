class AttachableDoc < ActiveRecord::Base

  belongs_to :company_doc
  belongs_to :documentable, polymorphic: true

end
