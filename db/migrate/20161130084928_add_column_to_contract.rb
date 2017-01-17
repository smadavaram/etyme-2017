class AddColumnToContract < ActiveRecord::Migration
  def change
    change_column_default :contracts, :status, 0
  end
end
