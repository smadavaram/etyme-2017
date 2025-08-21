class ChangeDefaultValueOfToDateForAddresses < ActiveRecord::Migration[4.2][5.1]
  def change
    change_column :addresses, :to_date, :date , :default=>nil

  end
end
