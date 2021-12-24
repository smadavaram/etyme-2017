# frozen_string_literal: true

# == Schema Information
#
# Table name: locations
#
#  id         :integer          not null, primary key
#  name       :string
#  address_id :integer
#  company_id :integer
#  status     :integer
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class Location < ApplicationRecord
  # validates :name , presence: true

  belongs_to  :company, optional: true
  # has_many    :jobs
  belongs_to  :address, optional: true

  accepts_nested_attributes_for :address, allow_destroy: true, reject_if: :all_blank
end
