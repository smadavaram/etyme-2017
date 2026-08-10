# frozen_string_literal: true

# == Schema Information
#
# Table name: branches
#
#  id          :bigint           not null, primary key
#  company_id  :bigint
#  branch_name :string
#  address     :string
#  city        :string
#  country     :string
#  zip         :string
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
class Branch < ActiveRecord::Base
  belongs_to :company
end
