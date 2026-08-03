/**
 * Full reset + seed.
 * Wipes all data then creates one restaurant with a complete menu,
 * two branches, tables, and one user per role.
 *
 *   cd apps/api && npx tsx prisma/seed.ts
 */
import bcrypt from "bcryptjs";
import { MenuItemType, Prisma, PrismaClient, TableStatus, UserRole } from "@prisma/client";
import { config } from "dotenv";

config();
process.env.DATABASE_URL ??= "postgresql://postgres:root@localhost:5432/restaurant_pos?schema=public";

const prisma = new PrismaClient();

// ── 1. Clear all tables (leaf → root) ────────────────────────────────────────
async function clearAll() {
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.restaurant.deleteMany();
  console.log("✓ Cleared all existing data");
}

// ── 2. Seed data ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Starters",         slug: "starters",       sortOrder: 10 },
  { name: "Soups",            slug: "soups",          sortOrder: 20 },
  { name: "Salads",           slug: "salads",         sortOrder: 30 },
  { name: "Tandoor",          slug: "tandoor",        sortOrder: 40 },
  { name: "Curries",          slug: "curries",        sortOrder: 50 },
  { name: "Rice & Biryani",   slug: "rice",           sortOrder: 60 },
  { name: "Noodles",          slug: "noodles",        sortOrder: 70 },
  { name: "Pizzas & Burgers", slug: "pizzas-burgers", sortOrder: 80 },
  { name: "Breads",           slug: "breads",         sortOrder: 85 },
  { name: "Desserts",         slug: "desserts",       sortOrder: 90 },
  { name: "Beverages",        slug: "beverages",      sortOrder: 100 },
] as const;

type CatSlug = typeof CATEGORIES[number]["slug"];

const ITEMS: Array<{
  cat: CatSlug; name: string; sku: string; type: MenuItemType;
  price: string; taxRate: string; description: string;
}> = [
  // Starters
  { cat: "starters",       name: "Crispy Veg Platter",   sku: "ST-001", type: MenuItemType.FOOD,     price: "169.00", taxRate: "5.00", description: "Golden fried vegetables with mint chutney." },
  { cat: "starters",       name: "Paneer 65",             sku: "ST-002", type: MenuItemType.FOOD,     price: "229.00", taxRate: "5.00", description: "Spiced cottage cheese bites, crispy outside." },
  { cat: "starters",       name: "Chicken Wings",         sku: "ST-003", type: MenuItemType.FOOD,     price: "289.00", taxRate: "5.00", description: "Sticky glazed wings tossed in house sauce." },
  { cat: "starters",       name: "Fish Tikka",            sku: "ST-004", type: MenuItemType.FOOD,     price: "319.00", taxRate: "5.00", description: "Marinated fish grilled in the tandoor." },
  // Soups
  { cat: "soups",          name: "Hot & Sour Soup",       sku: "SP-001", type: MenuItemType.FOOD,     price: "149.00", taxRate: "5.00", description: "Classic Indo-Chinese soup with vinegar heat." },
  { cat: "soups",          name: "Sweet Corn Soup",       sku: "SP-002", type: MenuItemType.FOOD,     price: "139.00", taxRate: "5.00", description: "Corn, pepper, and spring onion broth." },
  { cat: "soups",          name: "Tomato Shorba",         sku: "SP-003", type: MenuItemType.FOOD,     price: "129.00", taxRate: "5.00", description: "Spiced Indian tomato consommé." },
  // Salads
  { cat: "salads",         name: "Garden Fresh Salad",    sku: "SL-001", type: MenuItemType.FOOD,     price: "179.00", taxRate: "5.00", description: "Cucumber, lettuce, tomato, olives, and vinaigrette." },
  { cat: "salads",         name: "Greek Salad",           sku: "SL-002", type: MenuItemType.FOOD,     price: "219.00", taxRate: "5.00", description: "Feta, olives, cucumber, and herb dressing." },
  // Tandoor
  { cat: "tandoor",        name: "Paneer Tikka",          sku: "TD-001", type: MenuItemType.FOOD,     price: "279.00", taxRate: "5.00", description: "Char-grilled paneer with smoky spices." },
  { cat: "tandoor",        name: "Chicken Tikka",         sku: "TD-002", type: MenuItemType.FOOD,     price: "319.00", taxRate: "5.00", description: "Marinated chicken cooked in tandoor." },
  { cat: "tandoor",        name: "Malai Broccoli",        sku: "TD-003", type: MenuItemType.FOOD,     price: "249.00", taxRate: "5.00", description: "Creamy herb-marinated broccoli florets." },
  { cat: "tandoor",        name: "Seekh Kebab",           sku: "TD-004", type: MenuItemType.FOOD,     price: "299.00", taxRate: "5.00", description: "Minced lamb skewers with onion and mint." },
  // Curries
  { cat: "curries",        name: "Butter Paneer Masala",  sku: "CR-001", type: MenuItemType.FOOD,     price: "289.00", taxRate: "5.00", description: "Rich tomato-butter gravy with soft paneer." },
  { cat: "curries",        name: "Kadai Chicken",         sku: "CR-002", type: MenuItemType.FOOD,     price: "349.00", taxRate: "5.00", description: "Peppery chicken in onion-tomato masala." },
  { cat: "curries",        name: "Dal Tadka",             sku: "CR-003", type: MenuItemType.FOOD,     price: "199.00", taxRate: "5.00", description: "Tempered yellow lentils with ghee." },
  { cat: "curries",        name: "Palak Chicken",         sku: "CR-004", type: MenuItemType.FOOD,     price: "329.00", taxRate: "5.00", description: "Tender chicken in creamy spinach gravy." },
  { cat: "curries",        name: "Mutton Rogan Josh",     sku: "CR-005", type: MenuItemType.FOOD,     price: "399.00", taxRate: "5.00", description: "Kashmiri slow-cooked mutton curry." },
  // Rice & Biryani
  { cat: "rice",           name: "Veg Fried Rice",        sku: "RC-001", type: MenuItemType.FOOD,     price: "219.00", taxRate: "5.00", description: "Wok-tossed basmati with seasonal vegetables." },
  { cat: "rice",           name: "Chicken Biryani",       sku: "RC-002", type: MenuItemType.FOOD,     price: "349.00", taxRate: "5.00", description: "Aromatic dum biryani served with raita." },
  { cat: "rice",           name: "Mutton Biryani",        sku: "RC-003", type: MenuItemType.FOOD,     price: "419.00", taxRate: "5.00", description: "Slow-cooked mutton biryani with saffron." },
  { cat: "rice",           name: "Jeera Rice",            sku: "RC-004", type: MenuItemType.FOOD,     price: "169.00", taxRate: "5.00", description: "Cumin-scented basmati rice." },
  // Noodles
  { cat: "noodles",        name: "Hakka Noodles",         sku: "ND-001", type: MenuItemType.FOOD,     price: "229.00", taxRate: "5.00", description: "Stir-fried noodles with crunchy vegetables." },
  { cat: "noodles",        name: "Schezwan Noodles",      sku: "ND-002", type: MenuItemType.FOOD,     price: "249.00", taxRate: "5.00", description: "Spicy red chilli garlic noodles." },
  // Pizzas & Burgers
  { cat: "pizzas-burgers", name: "Margherita Pizza",      sku: "PB-001", type: MenuItemType.FOOD,     price: "299.00", taxRate: "5.00", description: "Mozzarella, basil, and house tomato sauce." },
  { cat: "pizzas-burgers", name: "Chicken BBQ Pizza",     sku: "PB-002", type: MenuItemType.FOOD,     price: "369.00", taxRate: "5.00", description: "BBQ chicken, capsicum, and mozzarella." },
  { cat: "pizzas-burgers", name: "Veg Supreme Burger",    sku: "PB-003", type: MenuItemType.FOOD,     price: "239.00", taxRate: "5.00", description: "Loaded veg patty with house sauce and slaw." },
  { cat: "pizzas-burgers", name: "Chicken Burger",        sku: "PB-004", type: MenuItemType.FOOD,     price: "289.00", taxRate: "5.00", description: "Grilled chicken, cheese, and jalapeño slaw." },
  // Breads
  { cat: "breads",         name: "Butter Naan",           sku: "BR-001", type: MenuItemType.FOOD,     price: "55.00",  taxRate: "5.00", description: "Soft leavened bread with butter." },
  { cat: "breads",         name: "Garlic Naan",           sku: "BR-002", type: MenuItemType.FOOD,     price: "65.00",  taxRate: "5.00", description: "Naan topped with garlic and coriander." },
  { cat: "breads",         name: "Cheese Naan",           sku: "BR-003", type: MenuItemType.FOOD,     price: "89.00",  taxRate: "5.00", description: "Stuffed with processed and cottage cheese." },
  { cat: "breads",         name: "Tandoori Roti",         sku: "BR-004", type: MenuItemType.FOOD,     price: "40.00",  taxRate: "5.00", description: "Whole wheat bread from the tandoor." },
  // Desserts
  { cat: "desserts",       name: "Gulab Jamun",           sku: "DS-001", type: MenuItemType.FOOD,     price: "129.00", taxRate: "5.00", description: "Two soft milk dumplings in rose syrup." },
  { cat: "desserts",       name: "Chocolate Brownie",     sku: "DS-002", type: MenuItemType.FOOD,     price: "149.00", taxRate: "5.00", description: "Warm brownie with vanilla ice cream." },
  { cat: "desserts",       name: "Ice Cream Sundae",      sku: "DS-003", type: MenuItemType.FOOD,     price: "159.00", taxRate: "5.00", description: "Vanilla scoop with nuts and chocolate fudge." },
  { cat: "desserts",       name: "Kheer",                 sku: "DS-004", type: MenuItemType.FOOD,     price: "119.00", taxRate: "5.00", description: "Creamy rice pudding with cardamom." },
  // Beverages
  { cat: "beverages",      name: "Masala Chai",           sku: "BV-001", type: MenuItemType.BEVERAGE, price: "79.00",  taxRate: "5.00", description: "Indian spiced tea." },
  { cat: "beverages",      name: "Fresh Lime Soda",       sku: "BV-002", type: MenuItemType.BEVERAGE, price: "99.00",  taxRate: "5.00", description: "Sweet or salty lime soda." },
  { cat: "beverages",      name: "Mango Lassi",           sku: "BV-003", type: MenuItemType.BEVERAGE, price: "119.00", taxRate: "5.00", description: "Thick yoghurt drink with mango pulp." },
  { cat: "beverages",      name: "Cold Coffee",           sku: "BV-004", type: MenuItemType.BEVERAGE, price: "129.00", taxRate: "5.00", description: "Chilled coffee with cream." },
  { cat: "beverages",      name: "Fresh Juice",           sku: "BV-005", type: MenuItemType.BEVERAGE, price: "109.00", taxRate: "5.00", description: "Seasonal fresh-pressed juice." },
  { cat: "beverages",      name: "Mineral Water",         sku: "BV-006", type: MenuItemType.BEVERAGE, price: "40.00",  taxRate: "5.00", description: "500 ml packaged drinking water." },
];

async function main() {
  await clearAll();

  // ── Restaurant ─────────────────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.create({
    data: { name: "Sunrise Kitchen", slug: "sunrise-kitchen" },
  });
  console.log(`✓ Restaurant: ${restaurant.name}`);

  // ── Branches ───────────────────────────────────────────────────────────────
  const mainBranch = await prisma.branch.create({
    data: { restaurantId: restaurant.id, name: "Main Dining",    code: "MAIN" },
  });
  const terraceBranch = await prisma.branch.create({
    data: { restaurantId: restaurant.id, name: "Terrace Lounge", code: "TERRACE" },
  });
  console.log(`✓ Branches: ${mainBranch.name}, ${terraceBranch.name}`);

  // ── Menu categories ────────────────────────────────────────────────────────
  await prisma.menuCategory.createMany({
    data: CATEGORIES.map(c => ({ ...c, restaurantId: restaurant.id, isActive: true })),
  });
  const categories = await prisma.menuCategory.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, slug: true } });
  const catMap = new Map(categories.map(c => [c.slug, c.id]));

  // ── Menu items ─────────────────────────────────────────────────────────────
  await prisma.menuItem.createMany({
    data: ITEMS.map(item => {
      const menuCategoryId = catMap.get(item.cat);
      if (!menuCategoryId) throw new Error(`Unknown category slug: ${item.cat}`);
      return {
        restaurantId:   restaurant.id,
        menuCategoryId,
        name:           item.name,
        sku:            item.sku,
        description:    item.description,
        type:           item.type,
        price:          new Prisma.Decimal(item.price),
        taxRate:        new Prisma.Decimal(item.taxRate),
        isActive:       true,
      };
    }),
  });
  console.log(`✓ Menu: ${CATEGORIES.length} categories, ${ITEMS.length} items`);

  // ── Tables ─────────────────────────────────────────────────────────────────
  const branchByCode = new Map([["MAIN", mainBranch.id], ["TERRACE", terraceBranch.id]]);

  const tableSeed = [
    // Main Dining — 8 tables
    { branch: "MAIN",    name: "Table 1",   code: "M-01", capacity: 2, sortOrder: 10 },
    { branch: "MAIN",    name: "Table 2",   code: "M-02", capacity: 4, sortOrder: 20 },
    { branch: "MAIN",    name: "Table 3",   code: "M-03", capacity: 4, sortOrder: 30 },
    { branch: "MAIN",    name: "Table 4",   code: "M-04", capacity: 6, sortOrder: 40 },
    { branch: "MAIN",    name: "Table 5",   code: "M-05", capacity: 2, sortOrder: 50 },
    { branch: "MAIN",    name: "Table 6",   code: "M-06", capacity: 4, sortOrder: 60 },
    { branch: "MAIN",    name: "Table 7",   code: "M-07", capacity: 8, sortOrder: 70 },
    { branch: "MAIN",    name: "Table 8",   code: "M-08", capacity: 4, sortOrder: 80 },
    // Terrace Lounge — 6 tables
    { branch: "TERRACE", name: "Terrace 1", code: "T-01", capacity: 2, sortOrder: 10 },
    { branch: "TERRACE", name: "Terrace 2", code: "T-02", capacity: 4, sortOrder: 20 },
    { branch: "TERRACE", name: "Terrace 3", code: "T-03", capacity: 4, sortOrder: 30 },
    { branch: "TERRACE", name: "Terrace 4", code: "T-04", capacity: 6, sortOrder: 40 },
    { branch: "TERRACE", name: "Terrace 5", code: "T-05", capacity: 2, sortOrder: 50 },
    { branch: "TERRACE", name: "Terrace 6", code: "T-06", capacity: 8, sortOrder: 60 },
  ] as const;

  await prisma.restaurantTable.createMany({
    data: tableSeed.map(t => ({
      restaurantId: restaurant.id,
      branchId:     branchByCode.get(t.branch)!,
      name:         t.name,
      code:         t.code,
      capacity:     t.capacity,
      status:       TableStatus.AVAILABLE,
      sortOrder:    t.sortOrder,
      isActive:     true,
    })),
  });
  console.log(`✓ Tables: ${tableSeed.length} tables (all AVAILABLE)`);

  // ── Users — one per role ───────────────────────────────────────────────────
  const HASH_ROUNDS = 12;

  const userSeed: Array<{
    role: UserRole; restaurantId: string | null; branchId: string | null;
    firstName: string; lastName: string; email: string; password: string;
  }> = [
    {
      role:         UserRole.SUPER_ADMIN,
      restaurantId: null,
      branchId:     null,
      firstName:    "Super",
      lastName:     "Admin",
      email:        "super@pos.local",
      password:     "Super@1234",
    },
    {
      role:         UserRole.RESTAURANT_ADMIN,
      restaurantId: restaurant.id,
      branchId:     null,
      firstName:    "Restaurant",
      lastName:     "Admin",
      email:        "admin@sunrise.local",
      password:     "Admin@1234",
    },
    {
      role:         UserRole.MANAGER,
      restaurantId: restaurant.id,
      branchId:     mainBranch.id,
      firstName:    "Branch",
      lastName:     "Manager",
      email:        "manager@sunrise.local",
      password:     "Manager@1234",
    },
    {
      role:         UserRole.CASHIER,
      restaurantId: restaurant.id,
      branchId:     mainBranch.id,
      firstName:    "Cash",
      lastName:     "Counter",
      email:        "cashier@sunrise.local",
      password:     "Cashier@1234",
    },
    {
      role:         UserRole.WAITER,
      restaurantId: restaurant.id,
      branchId:     mainBranch.id,
      firstName:    "Floor",
      lastName:     "Waiter",
      email:        "waiter@sunrise.local",
      password:     "Waiter@1234",
    },
    {
      role:         UserRole.KITCHEN,
      restaurantId: restaurant.id,
      branchId:     mainBranch.id,
      firstName:    "Head",
      lastName:     "Chef",
      email:        "kitchen@sunrise.local",
      password:     "Kitchen@1234",
    },
  ];

  for (const u of userSeed) {
    await prisma.user.create({
      data: {
        role:         u.role,
        restaurantId: u.restaurantId,
        branchId:     u.branchId,
        firstName:    u.firstName,
        lastName:     u.lastName,
        email:        u.email,
        passwordHash: await bcrypt.hash(u.password, HASH_ROUNDS),
        isActive:     true,
      },
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n✓ Seed complete — login credentials:\n");
  console.log("  Role               Email                     Password");
  console.log("  ─────────────────  ────────────────────────  ─────────────");
  for (const u of userSeed) {
    const role = u.role.padEnd(18);
    const email = u.email.padEnd(26);
    console.log(`  ${role}  ${email}  ${u.password}`);
  }
  console.log();
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
