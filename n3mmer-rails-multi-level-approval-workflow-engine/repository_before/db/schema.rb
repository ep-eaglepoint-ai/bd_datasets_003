ActiveRecord::Schema[7.1].define(version: 2024_01_01_000001) do
  enable_extension 'plpgsql'

  create_table :organizations do |t|
    t.string :name, null: false
    t.timestamps
  end

  create_table :departments do |t|
    t.string :name, null: false
    t.references :organization, foreign_key: true
    t.references :parent, foreign_key: { to_table: :departments }
    t.timestamps
  end

  create_table :users do |t|
    t.string :email, null: false, default: ''
    t.string :encrypted_password, null: false, default: ''
    t.string :first_name
    t.string :last_name
    t.string :role, default: 'employee'
    t.references :organization, foreign_key: true
    t.references :department, foreign_key: true
    t.references :manager, foreign_key: { to_table: :users }
    t.string :reset_password_token
    t.datetime :reset_password_sent_at
    t.datetime :remember_created_at
    t.timestamps
  end

  add_index :users, :email, unique: true
  add_index :users, :reset_password_token, unique: true

  create_table :purchase_orders do |t|
    t.string :title, null: false
    t.text :description
    t.decimal :amount, precision: 12, scale: 2, null: false
    t.string :status, default: 'draft'
    t.references :requester, foreign_key: { to_table: :users }
    t.references :organization, foreign_key: true
    t.timestamps
  end

  create_table :expense_reports do |t|
    t.string :title, null: false
    t.text :description
    t.decimal :amount, precision: 12, scale: 2, null: false
    t.string :status, default: 'draft'
    t.string :category
    t.references :submitter, foreign_key: { to_table: :users }
    t.references :organization, foreign_key: true
    t.timestamps
  end
end
