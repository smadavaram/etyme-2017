class AddColumnToContract < ActiveRecord::Migration[4.2]
  def change
    change_column_default :contracts, :status, 0
  end
end
