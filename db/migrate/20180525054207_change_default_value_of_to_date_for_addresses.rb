class ChangeDefaultValueOfToDateForAddresses < ActiveRecord::Migration[5.1]
  def change
    change_column :addresses, :to_date, :date , :default=>nil

  end
end
