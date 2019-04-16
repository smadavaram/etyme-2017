class AddColumnStartAndEndDateInDesignation < ActiveRecord::Migration[5.1]
  def change
    add_column :designations, :start_date, :date, default: nil
    add_column :designations, :end_date, :date, default: nil
  end
end
