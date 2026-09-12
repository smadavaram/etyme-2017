# frozen_string_literal: true

# == Schema Information
#
# Table name: packages
#
#  id          :integer          not null, primary key
#  name        :string
#  description :text
#  duration    :integer
#  price       :float
#  slug        :string
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
class Package < ApplicationRecord
  has_many :subscriptions
  has_many :companies, through: :subscriptions

  validates :name, :slug, presence: true, uniqueness: true

  before_create :set_slug

  def self.free
    find_by_slug('free')
  end

  def is_free?
    slug == 'free'
  end

  def is_paid?
    slug == 'paid'
  end

  def self.paid_plan
    find_by_slug('paid')
  end

  private

  # Call before create
  def set_slug
    self.slug = name.parameterize('-')
  end
end
