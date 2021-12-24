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
require 'test_helper'

class AttachableDocTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
