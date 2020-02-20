# frozen_string_literal: true

class AttachableDoc < ApplicationRecord
  belongs_to :company_doc, optional: true
  belongs_to :documentable, polymorphic: true, optional: true

  def is_file?
    file.present?
  end
end
