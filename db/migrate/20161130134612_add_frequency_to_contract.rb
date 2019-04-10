class AddFrequencyToContract < ActiveRecord::Migration[4.2]
  def change
    add_column :contracts, :billing_frequency, :integer , default: 0
    add_column :contracts, :time_sheet_frequency, :integer , default: 0
  end
end
