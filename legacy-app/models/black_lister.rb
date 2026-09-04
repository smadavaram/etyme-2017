# frozen_string_literal: true

# == Schema Information
#
# Table name: black_listers
#
#  id               :bigint           not null, primary key
#  company_id       :bigint
#  status           :integer          default("banned")
#  blacklister_type :string
#  blacklister_id   :bigint
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#
class BlackLister < ActiveRecord::Base
  belongs_to :company, foreign_key: 'company_id', class_name: 'Company'
  belongs_to :blacklister, polymorphic: true
  enum status: %i[banned unbanned]
end
