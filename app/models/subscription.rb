# frozen_string_literal: true

# == Schema Information
#
# Table name: subscriptions
#
#  id         :integer          not null, primary key
#  company_id :integer
#  package_id :integer
#  expiry     :datetime
#  status     :integer
#  amount     :float
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class Subscription < ApplicationRecord
  belongs_to :package, optional: true
  belongs_to :company, optional: true
end
