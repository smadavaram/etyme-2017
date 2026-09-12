# frozen_string_literal: true

# == Schema Information
#
# Table name: portfolios
#
#  id                 :integer          not null, primary key
#  name               :string
#  description        :text
#  cover_photo        :string
#  portfolioable_type :string
#  portfolioable_id   :integer
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#
class Portfolio < ApplicationRecord
  belongs_to :portfolioable, polymorphic: :true

  validates :cover_photo, presence: :true
end
