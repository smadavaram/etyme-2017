class SellRequestDocument < ApplicationRecord
  include PublicActivity::Model
  belongs_to :sell_contract, optional: true
  belongs_to :creatable      , polymorphic: :true, optional: true

  has_many :document_signs       , as: :documentable,dependent: :destroy

  # include NumberGenerator.new({prefix: 'SRD', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :document_signs, allow_destroy: true,reject_if: :all_blank
  validates :request, presence: true

  def set_number
    # self.number = self.sell_contract.number
    self.number = "SRD_" + self.sell_contract&.number&.split("_")[1].to_s
  end

  # def display_number
  #   "SRD"+self.number
  # end

end
