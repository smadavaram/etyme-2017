# frozen_string_literal: true

# == Schema Information
#
# Table name: billing_infos
#
#  id         :bigint           not null, primary key
#  company_id :bigint
#  address    :string
#  city       :string
#  country    :string
#  zip        :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class BillingInfo < ActiveRecord::Base
  belongs_to :company
end
