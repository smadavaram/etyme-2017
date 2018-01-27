class AttachableDoc < ApplicationRecord

  belongs_to :company_doc, optional: true
  belongs_to :documentable, polymorphic: true, optional: true

  def is_file?
    self.file.present?
  end

end
