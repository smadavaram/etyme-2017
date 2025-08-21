# frozen_string_literal: true

# == Schema Information
#
# Table name: prefer_vendors
#
#  id         :integer          not null, primary key
#  company_id :integer
#  vendor_id  :integer
#  status     :integer          default("pending")
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class PreferVendor < ApplicationRecord
  include PublicActivity::Model
  enum status: %i[pending accepted rejected]

  belongs_to :company, optional: true
  belongs_to :prefer_vendor, class_name: 'Company', foreign_key: 'vendor_id', optional: true
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  attr_accessor :company_ids

  after_create  :send_notifcation_to_vendor
  after_update  :send_notifcation_to_companies, if: proc { |vendor| vendor.status_changed? }

  def send_notifcation_to_vendor
    prefer_vendor.owner.notifications.create(title: 'Company Network Request', message: company.name + ' has requested to add you in his company network') if prefer_vendor.owner.present?
  end

  def send_notifcation_to_companies
    company.owner.notifications.create(title: 'Status on Network Request', message: prefer_vendor.name + " has #{status} to your request for Company Network")
  end
end
