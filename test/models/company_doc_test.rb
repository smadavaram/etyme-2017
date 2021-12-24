# frozen_string_literal: true

# == Schema Information
#
# Table name: company_docs
#
#  id                    :integer          not null, primary key
#  name                  :string
#  doc_type              :integer
#  created_by            :integer
#  company_id            :integer
#  file                  :string
#  is_required_signature :boolean
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#
require 'test_helper'

class CompanyDocTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
