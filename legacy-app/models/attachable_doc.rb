# frozen_string_literal: true

# == Schema Information
#
# Table name: attachable_docs
#
#  id                :integer          not null, primary key
#  company_doc_id    :integer
#  orignal_file      :string
#  documentable_type :string
#  documentable_id   :integer
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  file              :string
#
class AttachableDoc < ApplicationRecord
  belongs_to :company_doc, optional: true
  belongs_to :documentable, polymorphic: true, optional: true

  def is_file?
    file.present?
  end
end
